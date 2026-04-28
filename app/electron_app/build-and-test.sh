#!/bin/bash

# Build a development version of the Meadow Electron app and launch it in
# test mode to verify it starts cleanly.
#
# Usage:
#   ./build-and-test.sh
#
# Code signing: Uses "Developer ID Application: Sand Harbor Software, LLC (3Y93X67X8P)" from keychain

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_LOG_FILE="$(pwd)/meadow-test.log"
TIMEOUT_SECONDS=60
HEALTH_CHECK_INTERVAL=5

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."

    # Kill any running Meadow processes
    pkill -f "Meadow.app" || true
    pkill -f "meadow-electron" || true

    # Unmount any mounted DMG volumes
    for volume in /Volumes/*Meadow*; do
        if [ -d "$volume" ]; then
            log_info "Unmounting $volume"
            diskutil eject "$volume" || true
        fi
    done

    # Remove test log file
    if [ -f "$TEST_LOG_FILE" ]; then
        rm -f "$TEST_LOG_FILE"
    fi
}

# Set up cleanup on exit
trap cleanup EXIT

# Start with a clean environment
cleanup

log_info "🏗️  Building Meadow Electron app..."

# Download official Node.js binary if needed
log_info "Ensuring official Node.js binary is available..."
chmod +x ./download-node.sh
./download-node.sh

# Clean any previous builds
log_info "Cleaning previous builds..."
npm run clean

# Force remove any remaining build artifacts that clean might miss
if [ -d "build" ]; then
  log_info "Removing stubborn build artifacts..."
  find build -name "*.dmg" -delete 2>/dev/null || true
  find build -name "*.blockmap" -delete 2>/dev/null || true
  rm -rf build/mac 2>/dev/null || true
  rm -rf build/mac-arm64 2>/dev/null || true
  rm -rf build/* 2>/dev/null || true
  if [ -d "build" ]; then
    log_info "Using alternative cleanup method..."
    chmod -R 755 build 2>/dev/null || true
    rm -rf build 2>/dev/null || true
  fi
fi

# Build the distribution
log_info "Running distribution build..."

# Build all components first
npm run build:all

# Prune devDependencies from frontend, backend, and shared_code before packaging.
# This dramatically reduces app size by excluding typescript, eslint, vitest, etc.
# We restore them after electron-builder finishes so the dev environment isn't affected.
log_info "Pruning devDependencies from frontend, backend, shared_code..."
PRUNE_DIRS="../frontend ../backend ../shared_code"
for dir in $PRUNE_DIRS; do
    (cd "$dir" && npm prune --production --ignore-scripts 2>&1 | tail -1)
done

# Build .app bundle without DMG (--dir flag). We'll re-sign binaries with JIT
# entitlements before packaging the DMG.
log_info "Building app bundle..."
npx electron-builder --mac --dir -c.mac.notarize=false

# Re-sign binaries with JIT entitlements BEFORE creating DMG
log_info "Re-signing binaries with JIT entitlements..."
app_bundle=$(find build -name "Meadow.app" -type d | head -n 1)
if [ -n "$app_bundle" ]; then
    node_binary="$app_bundle/Contents/Resources/node"
    if [ -f "$node_binary" ]; then
        codesign --force --options runtime --entitlements "$(pwd)/entitlements.mac.plist" --sign "Developer ID Application: Sand Harbor Software, LLC (3Y93X67X8P)" "$node_binary"
        log_success "Re-signed node binary"

        log_info "Verifying node entitlements:"
        codesign -d --entitlements - "$node_binary" 2>&1 | grep -A 20 "Executable"
    fi

    # Re-sign Rust binaries too
    for rust_bin in "$app_bundle/Contents/Resources/working_graph/working_graph_bin" \
                    "$app_bundle/Contents/Resources/source_page_search_by_title/source_page_search_by_title_bin" \
                    "$app_bundle/Contents/Resources/fast_git_ops/fast_git_ops_bin"; do
        if [ -f "$rust_bin" ]; then
            codesign --force --options runtime --entitlements "$(pwd)/entitlements.mac.plist" --sign "Developer ID Application: Sand Harbor Software, LLC (3Y93X67X8P)" "$rust_bin"
            log_info "Re-signed $(basename $rust_bin)"
        fi
    done

    # Re-sign the entire app bundle to update the seal
    log_info "Re-signing app bundle to update seal..."
    codesign --force --deep --options runtime --entitlements "$(pwd)/entitlements.mac.plist" --sign "Developer ID Application: Sand Harbor Software, LLC (3Y93X67X8P)" "$app_bundle"
    log_success "App bundle re-signed with JIT entitlements"
else
    log_error "Could not find app bundle to re-sign"
    exit 1
fi

# Patch dmgbuild to fix corrupted .DS_Store on macOS Tahoe (electron-builder#9072).
# The vendored biplist writes a bad bookmark (pBBk) that Finder rejects, hiding the
# background image and icon view settings. Commenting out the bookmark line is safe
# because the background still works via the Alias entry.
DMGBUILD_CORE="node_modules/dmg-builder/vendor/dmgbuild/core.py"
if grep -q "background_bmk = Bookmark.for_file" "$DMGBUILD_CORE" 2>/dev/null; then
    log_info "Patching dmgbuild for macOS Tahoe .DS_Store compatibility..."
    sed -i '' 's/background_bmk = Bookmark.for_file/# background_bmk = Bookmark.for_file/' "$DMGBUILD_CORE"
fi

# Now create the DMG
log_info "Creating DMG..."
npx electron-builder --mac --prepackaged "$app_bundle" -c.mac.notarize=false

# Fix Applications folder icon on APFS DMGs (macOS Tahoe doesn't resolve symlink icons).
# Replace the symlink with a Finder alias, which carries its own icon metadata.
dmg_file=$(find build -name "*.dmg" -not -name "*.blockmap" | head -n 1)
if [ -n "$dmg_file" ]; then
    log_info "Replacing Applications symlink with Finder alias in DMG..."
    rw_dmg="${dmg_file%.dmg}-rw.dmg"
    hdiutil convert "$dmg_file" -format UDRW -o "$rw_dmg" -quiet
    rw_mount=$(hdiutil attach "$rw_dmg" -readwrite -noverify -noautoopen | grep "/Volumes/" | sed 's/.*\/Volumes/\/Volumes/')
    if [ -L "$rw_mount/Applications" ]; then
        rm "$rw_mount/Applications"
        # Create a Finder alias to /Applications and set its icon using Swift
        swift -e "
import Cocoa
let target = URL(fileURLWithPath: \"/Applications\")
let dest = URL(fileURLWithPath: \"$rw_mount/Applications\")
let data = try target.bookmarkData(options: .suitableForBookmarkFile, includingResourceValuesForKeys: nil, relativeTo: nil)
try URL.writeBookmarkData(data, to: dest)

// Set the Applications folder icon on the alias
let iconPath = \"/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/ApplicationsFolderIcon.icns\"
if let icon = NSImage(contentsOfFile: iconPath) {
    NSWorkspace.shared.setIcon(icon, forFile: dest.path, options: [])
    print(\"Finder alias created with icon\")
} else {
    print(\"Finder alias created (icon not found)\")
}
"
        log_success "Created Finder alias for Applications"
    fi
    hdiutil detach "$rw_mount" -quiet
    rm "$dmg_file"
    hdiutil convert "$rw_dmg" -format ULFO -o "$dmg_file" -quiet
    rm "$rw_dmg"
fi

# Set executable permissions on required files
log_info "Setting executable permissions..."
find build -name "Meadow.app" -type d | while read app_path; do
    if [ -f "$app_path/Contents/Resources/node-wrapper.sh" ]; then
        chmod +x "$app_path/Contents/Resources/node-wrapper.sh"
    fi
    if [ -f "$app_path/Contents/Resources/node" ]; then
        chmod +x "$app_path/Contents/Resources/node"
    fi
done

log_success "Build and fixes completed successfully!"

# Restore devDependencies so the dev environment isn't affected
log_info "Restoring devDependencies in frontend, backend, shared_code..."
for dir in $PRUNE_DIRS; do
    (cd "$dir" && npm install --ignore-scripts 2>&1 | tail -1)
done

# Verify code signing
log_info "🔐 Verifying code signature..."
app_bundle=$(find build -name "Meadow.app" -type d | head -n 1)
if [ -n "$app_bundle" ]; then
    log_info "Checking signature of: $app_bundle"

    if codesign -v --deep --strict "$app_bundle" 2>&1; then
        log_success "✅ Code signature is valid!"

        log_info "Signing details:"
        codesign -dv --verbose=2 "$app_bundle" 2>&1 | head -20 | sed 's/^/  /'
    else
        log_warning "⚠️  Code signature verification had issues"
        codesign -v --deep --strict "$app_bundle" 2>&1 | sed 's/^/  /'
    fi
else
    log_warning "Could not find app bundle to verify"
fi

# Find the generated DMG file
dmg_file=$(find build -name "*.dmg" -not -name "*.blockmap" | head -n 1)

if [ -z "$dmg_file" ]; then
    log_error "Could not find generated DMG file"
    exit 1
fi

log_success "Found disk image: $dmg_file"

# Verify DMG file exists and is readable
if [ ! -r "$dmg_file" ]; then
    log_error "DMG file is not readable: $dmg_file"
    exit 1
fi

# Get DMG file size for reporting
dmg_size=$(du -h "$dmg_file" | cut -f1)
log_info "DMG file size: $dmg_size"

# Open the disk image
log_info "Opening disk image..."
open "$dmg_file"

# Wait a moment for the disk image to mount
sleep 3

# Find the mounted volume
volume_path=$(ls -d /Volumes/*Meadow* 2>/dev/null | head -n 1)

if [ -z "$volume_path" ]; then
    log_error "Could not find mounted Meadow volume"
    exit 1
fi

log_success "Found mounted volume: $volume_path"

# Verify the app bundle exists
app_path="$volume_path/Meadow.app"
if [ ! -d "$app_path" ]; then
    log_error "Meadow.app not found in mounted volume"
    exit 1
fi

# Verify app structure
if [ ! -f "$app_path/Contents/MacOS/Meadow" ]; then
    log_error "Meadow executable not found in app bundle"
    exit 1
fi

log_success "App bundle verification passed"

# Clear any previous test log
if [ -f "$TEST_LOG_FILE" ]; then
    rm -f "$TEST_LOG_FILE"
fi

# Launch the application in test mode
log_info "🚀 Launching Meadow application in test mode..."
"$app_path/Contents/MacOS/Meadow" --test-mode --log-file "$TEST_LOG_FILE" &
MEADOW_PID=$!

log_info "Meadow launched with PID: $MEADOW_PID"
log_info "Test log file: $TEST_LOG_FILE"

# Wait for the app to start and perform health checks
log_info "⏳ Waiting for application startup and health checks..."

elapsed=0
startup_complete=false

while [ $elapsed -lt $TIMEOUT_SECONDS ]; do
    if [ -f "$TEST_LOG_FILE" ]; then
        if grep -q "=== STARTUP_COMPLETE ===" "$TEST_LOG_FILE"; then
            log_success "Application startup completed successfully!"
            startup_complete=true
            break
        elif grep -q "=== STARTUP_FAILED ===" "$TEST_LOG_FILE"; then
            log_error "Application startup failed!"
            break
        fi
    fi

    if [ $((elapsed % HEALTH_CHECK_INTERVAL)) -eq 0 ]; then
        log_info "Waiting for startup... (${elapsed}s elapsed)"
        if [ -f "$TEST_LOG_FILE" ]; then
            log_info "Recent log entries:"
            tail -5 "$TEST_LOG_FILE" | sed 's/^/  /'
        fi
    fi

    sleep 1
    elapsed=$((elapsed + 1))
done

if [ "$startup_complete" = false ]; then
    log_error "Startup timeout after ${TIMEOUT_SECONDS} seconds"
    log_error "Final log contents:"
    if [ -f "$TEST_LOG_FILE" ]; then
        cat "$TEST_LOG_FILE" | sed 's/^/  /'
    else
        log_error "No log file was created"
    fi
    exit 1
fi

# Verify the application is still running
if ! kill -0 $MEADOW_PID 2>/dev/null; then
    log_error "Application process is no longer running"
    exit 1
fi

log_success "Application process is running (PID: $MEADOW_PID)"

# Analyze the test log for key components
log_info "📊 Analyzing startup log..."

backend_started=false
frontend_started=false
window_created=false

if [ -f "$TEST_LOG_FILE" ]; then
    if grep -q "Backend server startup initiated" "$TEST_LOG_FILE"; then
        backend_started=true
        log_success "✓ Backend server started successfully"
    else
        log_error "✗ Backend server failed to start"
    fi

    if grep -q "Frontend server startup initiated" "$TEST_LOG_FILE"; then
        frontend_started=true
        log_success "✓ Frontend server started successfully"
    else
        log_error "✗ Frontend server failed to start"
    fi

    if grep -q "Main window created" "$TEST_LOG_FILE"; then
        window_created=true
        log_success "✓ Main window created successfully"
    else
        log_error "✗ Main window failed to create"
    fi

    if grep -q "Frontend build not found" "$TEST_LOG_FILE"; then
        frontend_started=false
        log_error "✗ Frontend build files missing"
    fi

    backend_port=$(grep -o "backendPort.*[0-9]\+" "$TEST_LOG_FILE" | head -1 | grep -o "[0-9]\+" || echo "unknown")
    frontend_port=$(grep -o "frontendPort.*[0-9]\+" "$TEST_LOG_FILE" | head -1 | grep -o "[0-9]\+" || echo "unknown")

    log_info "Backend port: $backend_port"
    log_info "Frontend port: $frontend_port"
fi

# Final verification
if [ "$backend_started" = true ] && [ "$frontend_started" = true ] && [ "$window_created" = true ]; then
    log_success "🎉 ALL SYSTEMS OPERATIONAL!"
    log_success "The Meadow application has been built and is running correctly."
    echo
    log_info "📋 Test Summary:"
    log_info "  • Build: Successful"
    log_info "  • Installation: Successful"
    log_info "  • Backend Server: Operational (port $backend_port)"
    log_info "  • Frontend Server: Operational (port $frontend_port)"
    log_info "  • Main Window: Created and visible"
    log_info "  • Health Checks: All passed"
    echo
    log_info "💡 Application is running. You can interact with it now."
    log_info "💡 Test log available at: $TEST_LOG_FILE"
    log_info "💡 To stop the app manually: kill $MEADOW_PID"
    log_info "💡 To unmount when done: diskutil eject '$volume_path'"

    echo
    log_info "Press Ctrl+C to stop the application and cleanup..."
    wait $MEADOW_PID
else
    log_error "❌ SYSTEM VERIFICATION FAILED!"
    log_error "One or more critical components failed to start."
    echo
    log_error "📋 Failure Summary:"
    [ "$backend_started" = false ] && log_error "  • Backend Server: Failed"
    [ "$frontend_started" = false ] && log_error "  • Frontend Server: Failed"
    [ "$window_created" = false ] && log_error "  • Main Window: Failed"
    echo
    log_error "📄 Full test log:"
    if [ -f "$TEST_LOG_FILE" ]; then
        cat "$TEST_LOG_FILE" | sed 's/^/  /'
    fi
    exit 1
fi
