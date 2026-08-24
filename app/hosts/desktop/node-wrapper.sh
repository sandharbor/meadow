#!/bin/bash
# Node.js wrapper script for embedded Electron app
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$SCRIPT_DIR/node"
exec "$NODE_BIN" "$@"
