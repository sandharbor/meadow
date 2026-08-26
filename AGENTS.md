# Agent Instructions

## Docs

Sometimes I'll allude to a "doc", for example when describing a specification.
Those are available in docs/content as markdown files.

## Ubiquitous Language

`app/concepts/` is the canonical, type-checked registry of Meadow's stable
domain and architecture language. When a change introduces or materially
changes a distinction that people, acceptance tests, documentation, or several
implementation areas need to name consistently, update the relevant
`MeadowConcept` with the code. Do not create parallel canonical prose in test
metadata or a sidecar file.

Concepts follow the existing app-area hierarchy. Cross-cutting concepts belong
in the narrowest honest central area and connect to their real implementation
symbols through inline, type-only `MeadowConceptParticipations` declarations.
This is design pressure, not a requirement to model every code symbol: add a
concept only for durable ubiquitous language, not for every helper, class, UI
control, or test. Read [`app/concepts/README.md`](app/concepts/README.md) before
adding or reorganizing concepts.

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
