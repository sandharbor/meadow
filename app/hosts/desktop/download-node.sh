#!/bin/bash

# Download official Node.js binary for bundling in Electron app
# This avoids issues with Homebrew's node depending on Homebrew libraries

set -e

NODE_VERSION="v20.11.0"
ARCH="arm64"
PLATFORM="darwin"
EXPECTED_NODE_SHA256="94392c916760a4f7bb7f75af86550ae2fb81649ff954dbdd33912ec219040314"

DOWNLOAD_URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${PLATFORM}-${ARCH}.tar.gz"
DOWNLOAD_DIR="$(dirname "$0")/vendor"
NODE_TARBALL="${DOWNLOAD_DIR}/node-${NODE_VERSION}-${PLATFORM}-${ARCH}.tar.gz"
NODE_DIR="${DOWNLOAD_DIR}/node-${NODE_VERSION}-${PLATFORM}-${ARCH}"
NODE_BINARY="${DOWNLOAD_DIR}/node"

echo "Downloading official Node.js ${NODE_VERSION} for ${PLATFORM}-${ARCH}..."

# Create vendor directory
mkdir -p "$DOWNLOAD_DIR"

# Download if not already present
if [ ! -f "$NODE_BINARY" ]; then
    echo "Downloading from: $DOWNLOAD_URL"
    curl -L -o "$NODE_TARBALL" "$DOWNLOAD_URL"
    
    echo "Extracting..."
    tar -xzf "$NODE_TARBALL" -C "$DOWNLOAD_DIR"
    
    echo "Copying node binary..."
    cp "${NODE_DIR}/bin/node" "$NODE_BINARY"
    chmod +x "$NODE_BINARY"
    
    echo "Cleaning up..."
    rm -rf "$NODE_TARBALL" "$NODE_DIR"
    
    echo "✅ Node.js binary downloaded to: $NODE_BINARY"
else
    echo "✅ Node.js binary already exists at: $NODE_BINARY"
fi

# Verify it works
echo "Verifying node binary..."
ACTUAL_NODE_SHA256="$(shasum -a 256 "$NODE_BINARY" | awk '{print $1}')"
if [ "$ACTUAL_NODE_SHA256" != "$EXPECTED_NODE_SHA256" ]; then
    echo "Node.js binary checksum mismatch: expected $EXPECTED_NODE_SHA256, got $ACTUAL_NODE_SHA256" >&2
    exit 1
fi
"$NODE_BINARY" --version
