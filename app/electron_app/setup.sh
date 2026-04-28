#!/bin/bash

# Meadow Electron App Setup Script
set -e

echo "🌿 Setting up Meadow Electron Desktop App..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the electron_app directory"
    exit 1
fi

echo "📦 Installing Electron app dependencies..."
npm install

echo "🔧 Installing backend dependencies..."
cd ../backend
npm install

echo "🎨 Installing frontend dependencies..."
cd ../frontend
npm install

echo "📚 Installing shared dependencies..."
cd ../shared
if [ -f "package.json" ]; then
    npm install
fi

echo "🦀 Building Rust source_page_search_by_title binary..."
cd ../native_utils/source_page_search_by_title/source_page_search_by_title_code
cargo build --release

echo "🦀 Building Rust fast_git_ops binary..."
cd ../../fast_git_ops/fast_git_ops_code
cargo build --release

echo "🏗️  Building backend..."
cd ../../../backend
npm run build

echo "⚡ Building frontend..."
cd ../frontend
npm run build

echo "🔨 Building Electron main process..."
cd ../electron_app
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