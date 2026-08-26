# Meadow Runtime Payload

This package builds Meadow's content-addressed Runtime Payload and assembles
the unsigned local QA distributions that consume it.

The payload includes the Runtime Supervisor, service, production Web Client,
native helpers, selected publishing providers, and an explicit self-contained
Node executable. Its manifest hashes every file and identifies the build
perspective (`standalone` or `composed`).

`runtimePayloadDefinition.mjs` is the canonical executable inventory used by
assembly, verification, and signing. `download-node.sh` owns the macOS Node.js
version and checksum, and `signRuntimePayload.mjs` signs that inventory before
refreshing the content manifest. Hosts and clients consume these shared
operations rather than maintaining their own lists of Runtime binaries.
`buildCommandArtifact.mjs` is the policy-neutral operation that builds the
Command Client, assembles it with a verified Runtime Payload, and creates the
relocatable ZIP.

## Local QA distributions

First prepare the pinned Node executable:

```bash
./download-node.sh
```

Then build the paired Desktop and Command artifacts:

```bash
npm run build:qa-distributions -- \
  --perspective standalone \
  --node-executable vendor/node
```

The output is outside the repository by default. It contains a local-QA
`Meadow.app`, a relocatable Command directory and ZIP archive, an artifact
inventory, and `payload-parity.json`. The inventory marks the artifacts as
local QA, and the parity report records their shared Runtime Payload identity.

Use `--payload-root` to assemble from an already verified payload, or
`--command-only` when only the relocatable Command artifact is required.
