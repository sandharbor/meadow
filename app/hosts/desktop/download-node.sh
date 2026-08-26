#!/bin/bash

# Compatibility entrypoint for Desktop build scripts. Runtime Payload owns the
# pinned Node.js download and verification implementation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/../../runtime/payload/download-node.sh" "$@"
