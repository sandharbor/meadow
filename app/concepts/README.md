# Meadow concepts

This directory is the canonical home of Meadow's ubiquitous language. A
`MeadowConcept` names a stable domain or architectural distinction that people,
tests, documentation, and implementation need to discuss consistently.

Concepts are source metadata, not production behavior. Production code must not
load the registry at runtime. Type-only participation declarations may refer to
concepts because they are erased during compilation.

## What belongs here

Add a concept when a distinction is durable enough that several parts of the
system need the same name, or when misunderstanding it would make a design or
acceptance decision ambiguous. Do not add every class, helper, screen, or test.
The registry describes the system's language, not its symbol table.

Definitions live in the app-area directory that owns the idea. Cross-cutting
concepts live in the narrowest honest central area and name their distributed
implementation through participation declarations. App areas are concepts too.

Every concept has a stable `id`, display `name`, shallow `kind`, `definition`,
`mechanics`, and `interplay`. Use `conceptText` and `conceptLink` for prose so
relationships are checked against the known concept IDs. `relatedConceptIds()`
derives related terms from outgoing links, structural relationships, and incoming
links; do not maintain a second related-terms list.

## Connecting implementation

When a concept declares `implementationRoles`, each role must be claimed beside
an actual implementation symbol—not in a sidecar file:

```ts
import type { runtimeService } from "../../../concepts/index.js";
import type { ParticipatesIn } from "../../../concepts/index.js";

export type RuntimeServiceMeadowConceptParticipations = [
  ParticipatesIn<typeof runtimeService, "start-service", typeof startRuntimeService>,
];
```

Participation declaration names end in `MeadowConceptParticipations`. This
creates compile-time pressure in both directions: renaming the role or the
implementation symbol breaks type checking, while the declaration emits no
JavaScript. A distributed behavior such as Cooperative Handoff is represented by
several such declarations at its real participants.

## Acceptance and documentation

Acceptance tests import concept values and pass them to `scenario()`. Reports and
labs render projections of those same values. A concept's acceptance coverage is
therefore derived from test references; no separate `ScenarioDoc` prose record is
canonical. New tests should reuse an existing concept when they exercise the same
language, and introduce or sharpen a concept only when the domain distinction is
genuinely new.
