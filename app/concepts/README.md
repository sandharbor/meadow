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

Acceptance tests import concept values, link them in prose, and pass them to
`addKeyFrame()`. Reports and labs render projections of those same values.
References provide discoverability, while executable assertions establish
verification; no separate `ScenarioDoc` prose record is canonical. New tests
should reuse an existing concept when they exercise the same
language, and introduce or sharpen a concept only when the domain distinction is
genuinely new.

## Behavioral rules

The Frontier pilot uses `kind: "behavioral-rule"` with a `parentId` naming its
owning concept. Each rule states one promise in `definition` and explains its
rationale and a concrete example in `mechanics`. It remains prose metadata;
execution and conditions stay in TypeScript tests.

Import a specific rule alongside its concept in an E2E scenario and pass the rule
to `addKeyFrame(rule)` where the behavior is visible. The report derives scenario
coverage from imports and connects each rule to its keyframes. Concept navigation
links to child rules and back to the parent. Evidence always belongs to the
selected run and scenario result. This pilot does not reclassify existing tests.

## Search facets

Set `searchFacet: true` on concepts that are useful category-level filters in
acceptance reports, such as Publishing, HTML Generation, and Frontier Bundle
Page. Facet eligibility is explicit and independent of concept kind or test
coverage; omission defaults to false. Behavioral rules use `searchFacet: false`
and remain accessible through their parent concept and direct evidence links.
The report keeps every concept available for documentation and screenshot
navigation, while only opted-in facets appear in the run filter pills.

Use `subAreas: [{ areaId, order }]` to expose an existing concept as a workflow
sub-area of one of its app areas. Run reports show an indented, parent-labeled
row for each selected area with sub-areas, in that area's declared workflow
order. Each row's All control clears only that parent's sub-area selections;
sub-area selections combine with other report filters. Expanded scenario
metadata shows Starts with, Areas, each area's declared sub-areas, then Concepts.
Source Setup - New and Source Setup - Edit precede Source Review Identity and
Source Review Workspace within Sourcing;
Custom Filtering and Filter Mixing are sub-areas of Curation. A sub-area keeps
its canonical concept definition and documentation.

## Scenario areas

Each scenario declares its app areas and sub-areas explicitly with
`scenarioAreas`. Reports, `--area` runs, and the Sub-areas row read only this
declaration. A concept's `appAreaIds` describe the concept itself and never
reach the scenarios that link it. List an area when the scenario acts in it or
verifies an outcome it owns, not when setup merely passes through it. A scenario
outside every app area declares `scenarioAreas([])`. Each listed sub-area must
belong to a listed area.

## Scenario interfaces

A scenario can exercise multiple interfaces: Web App, Dev Tools, and CLI.
Declare them with `test.use({ executionSurfaces: ['dev-tools', 'browser'] })`
when a scenario crosses interfaces. The report's Interface row supports multiple
selections with the same any-match behavior as Tags. Interface selections
combine with the other filter rows. Legacy single-interface reports still work.

## Linked scenario names and descriptions

Keep scenario-specific names and descriptions beside the executable test. Use
typed `conceptText` and `conceptLink` values to refer to reusable concepts defined
in this registry. `linkedScenarioName` supplies Playwright's plain-text name and
its captured rich annotation; `linkedScenarioDescription` supplies the formal
description annotation. Put the name before the description:

```ts
const name = linkedScenarioName(conceptText`Review ${conceptLink(scopeExclusion.id, 'scope exclusion')}s`);

const description = linkedScenarioDescription(conceptText`Stage a ${conceptLink(bridgeExclusion.id, 'bridge exclusion')} before acceptance.`);
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [scenarioIdentity, name.annotation, description.annotation, areas.annotation] }, async () => {
  // Test behavior.
});
```

Import the linked concept value from the registry. Missing exports and unknown
concept IDs fail the standard TypeScript checks. Reports capture the text
segments with the run rather than rebuilding old prose from edited specs. Quickcheck
requires every scenario to declare both variables, pass `name.name` as the test
title, and include both annotations. Reports retain support for older captures
that used the block comment immediately before the test.
The simplified Test Code pane starts with the captured name and description,
then the `test.use` setup and test body. It hides everything before the first
top-level `test.use`, along with the prose declarations (or legacy description
comment). Both scroll with the code;
the original source line numbers still anchor ticks and checkpoints. “show the real code”
reveals the original source.
Concept links in a captured name or description open the shared floating concept details
within the report. Select related scenarios shows the count in that run and
opens the run with that concept selected.

## Scenario sections

Declare linked section prose for each scenario beside their name and description:

```ts
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open the accepted bundle.` },
  review: { type: 'test', text: conceptText`Review the proposed ${conceptLink(bridgeExclusion.id, 'bridge exclusion')}.` },
});
// Include sections.annotation in the scenario's annotation array.
// Inside the test callback:
await test.step(sections.steps.setup, async () => {
  // Establish and checkpoint the starting state.
});
await test.step(sections.steps.review, async () => {
  // Act, assert the outcome, and checkpoint it.
});
```

The keyed declaration preserves order and supplies checked step names. Only the
first section may have type `setup`; subsequent sections use `test`. Use short
prose explaining the action and expected result, with document links where useful.
Each multiline step surrounds its own code and can end with a checkpoint.
When later sections need a value created by a step, return an object from the
step and destructure it at the test level (`const { editor } = await test.step(...)`).
The simplified code view keeps the original value declarations and hides this
transfer scaffolding. Mutable variables shared with callbacks stay in the test's
outer scope, preserving one binding across phases.

Sections are captured before execution so the report retains the whole scenario
even when an early step fails. The simplified Test Code view replaces the
section declaration and step wrappers with linked inline prose blocks. Original
line numbers still anchor commands and checkpoints; “show the real code” reveals
the declarations and wrappers. Details offers a Show sections checkbox, initially
off, which shows the test sections in order and omits setup. Older scenarios and
captures without sections keep their existing display.

## Shared documents and design pressures

`MeadowDocument` supplies a stable ID, name, linked description, optional app-area
associations, and ordered sections. Sections contain paragraphs or lists of
`DocumentText`. This is the existing text/link encoding, so older captured
`concept-link` segments remain readable. `documentText` and `documentLink` are
authoring aliases with checked `CoreDocumentId` references.

`documentKind` chooses the document schema; `kind` retains a concept's domain
classification. `conceptDocument()` projects the canonical definition into the
description and Mechanics/Interplay sections without a second prose registry.
Fixtures use the same surface with a short description. Scenario name and
description annotations remain beside executable tests and use the same linked
text. Contract type documentation can later have a minimal schema with a checked
type-only reference; do not import production values to populate documentation.

Design pressures use `documentKind: 'design-pressure'` and require Motivation,
Response, and Tradeoffs sections. They explain why several mechanisms coexist.
They live in `designPressures`, outside `allCoreConcepts` and `acceptanceConcepts`,
so importing a pressure does not turn it into an ordinary concept filter or a
claim of test coverage. For a scenario that explicitly demonstrates the pressure:

```ts
const pressures = scenarioDesignPressures([preventAccidentalSharing]);
// Include pressures.annotation beside name, description, areas, and scenario-id.
```

Quickcheck checks literal declarations, known pressure IDs, duplicates, and the
annotation. Static declarations also cover skipped scenarios. A link in prose
does not imply a pressure association. The first pressure explains protection
against accidental sharing through source markings, filter-derived sensitivity,
safe automatic tracking, renewed explicit decisions, generation, and publishing.
Its Changes Since Tracking rules distinguish advisory findings and reviewed inclusion decisions.

`documentPassages()` traverses descriptions and every section block. Validation,
related links, and contextual backlinks use this traversal. `loadDocumentRegistry()`
is the tooling-only composition path for core concepts, optional contributions,
pressures, and fixtures. IDs and names/aliases are validated across document kinds.

Documents may belong to several app areas and appear in each area's browser.
Area association does not make a concept a workflow sub-area; that still requires
`subAreas`. The viewer shows kind and area links under the title and distinguishes
browsing from explicit scenario selection. Concepts are documented ideas; tagging
is their use as filters, with `searchFacet` retaining the curated filter list.

## Captured document history

The parent test reporter writes `documents.json` once at run start: the document
catalog and the full declared scenario association index, even for a filtered
run. Each scenario writes resolved concept, area, sub-area, fixture, and pressure
IDs to `scenario-documents.json`. Assembly reads those IDs without re-resolving
old imports through current export names. Partial reruns retain the run's catalog.

Run navigation passes its context through links and new document pages. Results
come from that run; declared examples absent from it are shown as not run. Missing
legacy pressure associations stay distinct from explicit empty associations.
Older runs without a catalog use a visibly identified current-documentation
fallback. Corrupt captures report an error. Implementation navigation is labelled
Current code and always checks the current inline participation locations.

## Area boundary map

The report viewer's closed Area boundaries disclosure reads current public exports
and shared symbol usage through the same ownership policy as the boundary checks.
It presents five lifecycle lanes, with separate groups for APIs, types, documented
data and artifacts, runtime values, and shared capabilities. Shared declarations
appear only when used across multiple lifecycle areas; aliases and transitive
shared declaration dependencies resolve to their original symbols. Bundles and
App Shell are shown as additional named participants. Category disclosures keep
large shared directories manageable, and search narrows the map.

Code reference documents are generated current-code details, not canonical ideas
or captured run metadata. Their path-based identities may change when code moves.
Use the linked concept document's stable ID to discuss and link a higher-level
idea. Inline participations connect concepts to several implementation locations,
including contract interfaces and type aliases. Current reference pages show
those higher-level explanations alongside declarations and consumer locations.
The document browser nests Design pressures beside App areas and All documents;
its compact search includes descriptions, aliases, and complete section text.


## Semantic titles

Every document may carry an optional `semanticTitle` using the existing checked
linked-text representation. Keep `name` as a readable plain title. The document
viewer shows the semantic phrase underneath as AKA, with each linked term
navigating to its document. Semantic titles participate in passage validation,
backlinks, related documents, search, and run captures. Old captures without the
field remain readable; reassembly never replaces captured title text.

Changes Since Tracking describes relevant differences since a node's recorded
inclusion decision. Tracked Bundle Node Becomes Sensitive is its node-local
sensitivity rule, covering files, folders, and collections without inheritance.
Generation and sharing remain available with a visible review warning.
