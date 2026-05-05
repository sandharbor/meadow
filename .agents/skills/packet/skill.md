---
name: packet
description: Open the review packet (e2e report viewer) in a browser
---

# Open Review Packet

Kill any running report viewer, start it fresh from this codebase, and open a
browser window to review e2e test artifacts.

## Instructions

Run these commands in order:

```bash
# 1. Kill any existing report viewer processes on ports 5175 (client) and 3456 (server)
lsof -ti:5175 | xargs kill -9 2>/dev/null || true
lsof -ti:3456 | xargs kill -9 2>/dev/null || true

# 2. Start the report viewer (server + client) in the background
cd app/e2e-tests/report-viewer && npm start &

# 3. Wait for the client to be ready
sleep 3

# 4. Open in browser
open http://localhost:5175
```

Report to the user that the review packet is open at http://localhost:5175.
