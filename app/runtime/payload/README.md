# Meadow Runtime Payload

This package builds Meadow's content-addressed Runtime Payload and assembles
the unsigned local QA distributions that consume it.

The payload includes the Runtime Supervisor, service, production Web Client,
native helpers, selected publishing providers, and an explicit self-contained
Node executable. Its manifest hashes every file and identifies the build
perspective (`standalone` or `composed`).

## Local QA distributions

First prepare the pinned Node executable:

```bash
../../hosts/desktop/download-node.sh
```

Then build the paired Desktop and Command artifacts:

```bash
npm run build:qa-distributions -- \
  --perspective standalone \
  --node-executable ../../hosts/desktop/vendor/node
```

The output is outside the repository by default. It contains an unsigned
`Meadow.app`, a relocatable Command directory and ZIP archive, an artifact
inventory, and `payload-parity.json`. These outputs are for local QA only; the
assembler performs no signing, notarization, upload, release, or updater work.

Use `--payload-root` to assemble from an already verified payload, or
`--command-only` when only the relocatable Command artifact is required.
