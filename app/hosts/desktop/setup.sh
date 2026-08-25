#!/bin/bash

# Meadow Electron App Setup Script
set -e

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
"$REPO_ROOT/_module/scripts/require-node-version"

echo "🌿 Setting up Meadow Electron Desktop App..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the hosts/desktop directory"
    exit 1
fi

echo "📦 Installing Electron app dependencies..."
npm install

echo "🔧 Installing backend dependencies..."
cd ../../runtime/service
npm install

echo "🎨 Installing frontend dependencies..."
cd ../../clients/web
npm install

echo "📚 Installing shared dependencies..."
cd ../../shared
if [ -f "package.json" ]; then
    npm install
fi

echo "🦀 Building Rust source_page_search_by_title binary..."
cd ../runtime/native/source_page_search_by_title/source_page_search_by_title_code
cargo build --release

echo "🦀 Building Rust fast_git_ops binary..."
cd ../../fast_git_ops/fast_git_ops_code
cargo build --release

echo "🏗️  Building backend..."
cd ../../../service
npm run build

echo "⚡ Building frontend..."
cd ../../clients/web
npm run build

echo "🔨 Building Electron main process..."
cd ../../hosts/desktop
npm run build:main

echo "✅ Setup complete!"
echo ""
echo "🚀 To start the app in development mode, run:"
echo "   npm run electron-dev"
echo ""
echo "📦 To build for distribution, run:"
echo "   npm run dist:mac"
echo ""
echo "📝 Note: You may want to replace the placeholder icons in assets/ with proper app icons"
