#!/bin/bash

# Download official Node.js binary for bundling in Electron app
# This avoids issues with Homebrew's node depending on Homebrew libraries

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
NODE_VERSION="v$(tr -d '[:space:]' < "$REPO_ROOT/.node-version")"
ARCH="arm64"
PLATFORM="darwin"
EXPECTED_TARBALL_SHA256="8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d"
EXPECTED_NODE_SHA256="27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1"

DOWNLOAD_URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${PLATFORM}-${ARCH}.tar.gz"
DOWNLOAD_DIR="$SCRIPT_DIR/vendor"
NODE_TARBALL="${DOWNLOAD_DIR}/node-${NODE_VERSION}-${PLATFORM}-${ARCH}.tar.gz"
NODE_DIR="${DOWNLOAD_DIR}/node-${NODE_VERSION}-${PLATFORM}-${ARCH}"
NODE_BINARY="${DOWNLOAD_DIR}/node"

echo "Downloading official Node.js ${NODE_VERSION} for ${PLATFORM}-${ARCH}..."

# Create vendor directory
mkdir -p "$DOWNLOAD_DIR"

# Re-download when the cached binary is absent or does not match the pin.
DOWNLOAD_REQUIRED=true
if [ -f "$NODE_BINARY" ]; then
    ACTUAL_VERSION="$("$NODE_BINARY" --version 2>/dev/null || true)"
    ACTUAL_NODE_SHA256="$(shasum -a 256 "$NODE_BINARY" | awk '{print $1}')"
    if [ "$ACTUAL_VERSION" = "$NODE_VERSION" ] && [ "$ACTUAL_NODE_SHA256" = "$EXPECTED_NODE_SHA256" ]; then
        DOWNLOAD_REQUIRED=false
        echo "✅ Node.js binary already matches ${NODE_VERSION}: $NODE_BINARY"
    else
        echo "↻ Replacing stale bundled Node.js binary (${ACTUAL_VERSION:-unknown})"
        rm -f "$NODE_BINARY"
    fi
fi

if [ "$DOWNLOAD_REQUIRED" = true ]; then
    echo "Downloading from: $DOWNLOAD_URL"
    curl --fail --location --output "$NODE_TARBALL" "$DOWNLOAD_URL"

    ACTUAL_TARBALL_SHA256="$(shasum -a 256 "$NODE_TARBALL" | awk '{print $1}')"
    if [ "$ACTUAL_TARBALL_SHA256" != "$EXPECTED_TARBALL_SHA256" ]; then
        echo "Node.js archive checksum mismatch: expected $EXPECTED_TARBALL_SHA256, got $ACTUAL_TARBALL_SHA256" >&2
        exit 1
    fi

    echo "Extracting..."
    tar -xzf "$NODE_TARBALL" -C "$DOWNLOAD_DIR"

    echo "Copying node binary..."
    cp "${NODE_DIR}/bin/node" "$NODE_BINARY"
    chmod +x "$NODE_BINARY"

    echo "Cleaning up..."
    rm -rf "$NODE_TARBALL" "$NODE_DIR"

    echo "✅ Node.js binary downloaded to: $NODE_BINARY"
fi

# Verify it works
echo "Verifying node binary..."
ACTUAL_NODE_SHA256="$(shasum -a 256 "$NODE_BINARY" | awk '{print $1}')"
if [ "$ACTUAL_NODE_SHA256" != "$EXPECTED_NODE_SHA256" ]; then
    echo "Node.js binary checksum mismatch: expected $EXPECTED_NODE_SHA256, got $ACTUAL_NODE_SHA256" >&2
    exit 1
fi
"$NODE_BINARY" --version
