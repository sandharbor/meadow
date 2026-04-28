---
name: app-build
description: Build the Meadow Electron app and launch it in test mode to verify it starts cleanly
---

# App Build

Build the Meadow desktop app from source and launch the built app in test mode so you can verify it starts and runs correctly.

**Important:** The shell working directory persists between Bash tool calls, so relative `cd` commands cause doubled-path errors. As the very first Bash command, resolve the repo root and store it in a variable:

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
```

Then use `$REPO_ROOT` in all subsequent commands. Never use bare relative paths like `cd app/electron_app`.

## Step 1: Check for a running Meadow app

The build launches a freshly-built Meadow app in test mode. If an existing Meadow app is already running, macOS's single-instance behavior kills the newly launched instance before it finishes starting, and the verification step fails with a confusing startup timeout.

```bash
pgrep -f "Meadow.app/Contents/MacOS/Meadow" || true
```

If this returns any PIDs, **stop immediately** and tell the user:

> "app-build aborted: a Meadow app is already running. Please quit Meadow (cmd+Q) before running /app-build again."

Do not attempt to kill it yourself — the user may have unsaved state.

## Step 2: Build and launch

```bash
cd "$REPO_ROOT/app/electron_app" && ./build-and-test.sh
```

This builds all components (rust binaries, backend, frontend, electron main), packages the app, mounts the result, and launches Meadow with `--test-mode`. The script waits for `=== STARTUP_COMPLETE ===` in the test log and then blocks so you can interact with the running app. Press Ctrl+C to stop — the script unmounts the volume and kills the launched process on exit.

## Step 3: Summary

When the user stops the session, report:

- Whether backend, frontend, and main-window startup markers all appeared in the test log
- The built app location under `app/electron_app/build/`
