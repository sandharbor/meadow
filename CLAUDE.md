# Claude Code Instructions

## Docs

Sometimes I'll allude to a "doc", for example when describing a specification.
Those are available in docs/content as markdown files.

## After Making Changes

Always run the `./quickcheck` script after making changes:

```bash
./quickcheck
```

This script must always pass. If it doesn't pass, that's a problem even if the
failure seems unrelated to the change you just made. It is our safety net.

The quickcheck script runs validation across all the modules (directories
containing _module folders)

## Building

To build the Electron app and launch it in test mode, run the `/app-build` skill