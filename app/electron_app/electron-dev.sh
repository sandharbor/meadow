#!/bin/bash

# Start the build process in background
npm run build:dev &
BUILD_PID=$!

# Wait for the main.js file to be created
echo "Waiting for build to complete..."
wait-on dist/electron_app/src/main.js

# Start electron with all arguments passed to this script
echo "Starting Electron with arguments: $@"
electron . "$@"

# Clean up
kill $BUILD_PID 2>/dev/null
