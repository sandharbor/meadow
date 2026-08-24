#!/bin/bash

# Icon generation script for Meadow Electron app
# This script converts meadow-big.png to the required icon formats

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/assets"
SOURCE_IMAGE="$ASSETS_DIR/meadow-big.png"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🎨 Meadow Icon Generation Script${NC}"
echo -e "${BLUE}=================================${NC}"

# Check if source image exists
if [ ! -f "$SOURCE_IMAGE" ]; then
    echo -e "${RED}❌ Error: Source image not found at $SOURCE_IMAGE${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found source image: meadow-big.png${NC}"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for required tools
echo -e "${YELLOW}🔍 Checking for required tools...${NC}"

MISSING_TOOLS=()

# Check for ImageMagick (magick command)
if ! command_exists magick; then
    MISSING_TOOLS+=("imagemagick")
fi

# Check for iconutil (macOS built-in)
if [[ "$OSTYPE" == "darwin"* ]] && ! command_exists iconutil; then
    echo -e "${RED}❌ iconutil not found (this shouldn't happen on macOS)${NC}"
    exit 1
fi

# Install missing tools if needed
if [ ${#MISSING_TOOLS[@]} -ne 0 ]; then
    echo -e "${YELLOW}📦 Installing missing tools: ${MISSING_TOOLS[*]}${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - use Homebrew
        if command_exists brew; then
            for tool in "${MISSING_TOOLS[@]}"; do
                echo -e "${YELLOW}Installing $tool with Homebrew...${NC}"
                brew install "$tool"
            done
        else
            echo -e "${RED}❌ Homebrew not found. Please install Homebrew and run this script again.${NC}"
            echo -e "${YELLOW}Install Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"${NC}"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux - use apt
        if command_exists apt-get; then
            sudo apt-get update
            for tool in "${MISSING_TOOLS[@]}"; do
                echo -e "${YELLOW}Installing $tool with apt...${NC}"
                sudo apt-get install -y "$tool"
            done
        else
            echo -e "${RED}❌ Package manager not found. Please install ImageMagick manually.${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ Unsupported OS. Please install ImageMagick manually.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ All required tools are available${NC}"

# Create temporary directory for icon generation
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo -e "${YELLOW}🔄 Generating icons...${NC}"

# Generate PNG icon (1024x1024 for high resolution, then resize to 512x512 for Linux)
echo -e "${BLUE}Generating PNG icon...${NC}"
magick "$SOURCE_IMAGE" -resize 512x512 "$ASSETS_DIR/icon.png"
echo -e "${GREEN}✅ Generated icon.png (512x512)${NC}"

# Generate ICO for Windows (multiple sizes in one file)
echo -e "${BLUE}Generating ICO icon for Windows...${NC}"
magick "$SOURCE_IMAGE" \
    \( -clone 0 -resize 16x16 \) \
    \( -clone 0 -resize 24x24 \) \
    \( -clone 0 -resize 32x32 \) \
    \( -clone 0 -resize 48x48 \) \
    \( -clone 0 -resize 64x64 \) \
    \( -clone 0 -resize 128x128 \) \
    \( -clone 0 -resize 256x256 \) \
    -delete 0 "$ASSETS_DIR/icon.ico"
echo -e "${GREEN}✅ Generated icon.ico (multi-size)${NC}"

# Generate ICNS for macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${BLUE}Generating ICNS icon for macOS...${NC}"
    
    # Create iconset directory
    ICONSET_DIR="$TEMP_DIR/icon.iconset"
    mkdir -p "$ICONSET_DIR"
    
    # Generate all required sizes for macOS iconset
    magick "$SOURCE_IMAGE" -resize 16x16 "$ICONSET_DIR/icon_16x16.png"
    magick "$SOURCE_IMAGE" -resize 32x32 "$ICONSET_DIR/icon_16x16@2x.png"
    magick "$SOURCE_IMAGE" -resize 32x32 "$ICONSET_DIR/icon_32x32.png"
    magick "$SOURCE_IMAGE" -resize 64x64 "$ICONSET_DIR/icon_32x32@2x.png"
    magick "$SOURCE_IMAGE" -resize 128x128 "$ICONSET_DIR/icon_128x128.png"
    magick "$SOURCE_IMAGE" -resize 256x256 "$ICONSET_DIR/icon_128x128@2x.png"
    magick "$SOURCE_IMAGE" -resize 256x256 "$ICONSET_DIR/icon_256x256.png"
    magick "$SOURCE_IMAGE" -resize 512x512 "$ICONSET_DIR/icon_256x256@2x.png"
    magick "$SOURCE_IMAGE" -resize 512x512 "$ICONSET_DIR/icon_512x512.png"
    magick "$SOURCE_IMAGE" -resize 1024x1024 "$ICONSET_DIR/icon_512x512@2x.png"
    
    # Convert iconset to icns
    iconutil -c icns "$ICONSET_DIR" -o "$ASSETS_DIR/icon.icns"
    echo -e "${GREEN}✅ Generated icon.icns (macOS iconset)${NC}"
else
    echo -e "${YELLOW}⚠️  Skipping ICNS generation (not on macOS)${NC}"
    echo -e "${YELLOW}   You may need to generate the ICNS file on a macOS system${NC}"
fi

# Display file sizes
echo -e "${BLUE}📊 Generated icon files:${NC}"
if [ -f "$ASSETS_DIR/icon.png" ]; then
    SIZE=$(du -h "$ASSETS_DIR/icon.png" | cut -f1)
    echo -e "${GREEN}   icon.png: $SIZE${NC}"
fi
if [ -f "$ASSETS_DIR/icon.ico" ]; then
    SIZE=$(du -h "$ASSETS_DIR/icon.ico" | cut -f1)
    echo -e "${GREEN}   icon.ico: $SIZE${NC}"
fi
if [ -f "$ASSETS_DIR/icon.icns" ]; then
    SIZE=$(du -h "$ASSETS_DIR/icon.icns" | cut -f1)
    echo -e "${GREEN}   icon.icns: $SIZE${NC}"
fi

echo -e "${GREEN}🎉 Icon generation completed successfully!${NC}"
echo -e "${BLUE}You can now build your Electron app with the new icons.${NC}" 