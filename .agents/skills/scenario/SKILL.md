---
name: scenario
description: Create a new end-to-end test scenario
---

# Create E2E Scenario

Create a new end-to-end test scenario. Follow the patterns established by
existing scenarios.

## Step 1: Understand the request

The user will describe what the scenario should test. They may also mention
Meadow concepts they want the scenario to exercise.

## Step 2: Study existing patterns

Read the existing test specs, page objects, and workflows to follow established
conventions:

- `app/acceptance/e2e/tests/*.spec.ts` — existing test scenarios
- `app/acceptance/e2e/src/run/workflows.ts` — composable navigation helpers (use these first!)
- `app/acceptance/e2e/src/run/pages/` — page object models
- `app/concepts/` — canonical Meadow concepts and app areas
- `app/acceptance/e2e/src/run/test-fixtures.ts` — custom fixtures (`artifactDir`, `snapshot`, `addKeyFrame`)

## Step 3: Create the scenario

### CRITICAL: Structure Rules

Read and follow the coding standards in
[`app/acceptance/e2e/_module/docs/coding_standards.md`](../../../app/acceptance/e2e/_module/docs/coding_standards.md).

### Creating the spec file

1. Create the new test spec in `app/acceptance/e2e/tests/` — **one test per file**.
2. Wire up Meadow concepts (normally reuse existing ones) — see below.
3. Add keyframe captures at meaningful moments — see below.
4. Use workflows for navigation and page objects for interactions.

### Meadow Concepts and Keyframes

Every test must be tied to at least one **MeadowConcept** via a **keyframe**.
This is how tests are categorized and visually documented in the report viewer.

**MeadowConcepts** define Meadow's stable domain and architecture language, not
just test tags. They live with their owning app area under `app/concepts/` and
include typed definition, mechanics, interplay, and links to other concepts:

```typescript
// app/concepts/bundle/sharing/concepts.ts
export const publishing = defineMeadowConcept({
  id: coreConceptIds.publishing,
  name: "Publishing",
  kind: "process",
  appAreaIds: [coreConceptIds.bundleSharing],
  definition: conceptText`The flow that makes reviewed output available...`,
  mechanics: [conceptText`It previews, reviews, and transfers artifacts.`],
  interplay: conceptText`It consumes ${conceptLink(coreConceptIds.bundleGeneration, "Bundle Generation")} output.`,
});
```

Read `app/concepts/README.md` before adding one. Reuse a concept when the test
exercises existing language. Add or sharpen one only when the behavior exposes a
durable distinction that the rest of the system should also name; do not create
a concept for every test or UI control. New concepts must be exported through
`app/concepts/index.ts`.

The relationship between tests and concepts is **many-to-many**. A single
test often touches multiple functional areas, so it imports and tags multiple
concepts. Conversely, one concept may appear across many tests. Acceptance
coverage is derived from those imports; never maintain a reverse coverage list.

**Keyframes** are the mechanism that links tests to concepts. Calling
`await addKeyFrame(concept)` does two things:
1. Takes a screenshot saved as `keyframe-{docId}.png` in the artifact directory
2. Links that screenshot to the concept so the report viewer can display it as
   a visual checkpoint, filtered by concept

**Every test must call `addKeyFrame` at least once.** Capture a keyframe at the
moment that best represents each functional area being tested — typically right
after the key UI state is reached.

Example — a test using workflows and covering multiple areas:

```typescript
import { test, expect } from "../src/run/test-fixtures.js";
import { publishing, s3 } from "../../../concepts/index.js";
import { Workflows } from "../src/run/workflows.js";

test("Bundle publishes to S3", async ({
  page, snapshot, addKeyFrame, testServer,
}) => {
  await testServer.activateS3Provider();

  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundleShareTab();
  // ... test-specific interactions ...
  await addKeyFrame(publishing);
  await addKeyFrame(s3);
  await snapshot("bundle published to S3");
});
```

## Step 4: Run /e2e

After creating the scenario, invoke the `/e2e` skill to run the full test
suite and confirm the new scenario passes alongside all existing ones.

When you do this, pass `--highlighted <basename>` to mark the new (or fixed)
spec so the reviewer can spot it immediately in the report viewer. The
`--highlighted` flag takes the spec filename without `.spec.ts` and, unlike
`--scenarios`, doesn't filter the run — it just promotes the spec into a
dedicated "Highlighted" section in the thumbs / list / videos tabs and tints
its concept chips amber. See the `/e2e` skill for details.

---

## Check Mode

When invoked with `/scenario check`, skip the creation steps above. Instead,
review the most recently created or modified test scenario against this
checklist. Go through each item one by one, reading the relevant files to
verify compliance. Report pass/fail for each item.

### Checklist

1. **One test per file** — Each `.spec.ts` file contains exactly one `test(...)` call.
2. **Workflows used** — Navigation uses `Workflows` class methods where applicable, not inlined page object sequences.
3. **Page object locators centralized** — Any new page object locators are defined as private getters, not duplicated across methods.
4. **No inline selectors in tests** — The test file doesn't contain raw `page.locator(...)` calls for things a page object should own. (One-off assertions on text content are fine.)
5. **Test spec exists** — A `.spec.ts` file exists in `app/acceptance/e2e/tests/` for the scenario.
6. **Concepts identified** — The test imports one or more canonical concepts covering the stable language it exercises. Existing concepts are reused where applicable; new concepts satisfy the inclusion boundary in `app/concepts/README.md`.
7. **New concepts registered** — Any newly created concept is placed in its owning app-area hierarchy and exported from `app/concepts/index.ts`; implementation roles are declared inline beside real symbols.
8. **Keyframes captured** — The test calls `await addKeyFrame(concept)` at least once per imported acceptance concept, at a meaningful moment for that area.
9. **`addKeyFrame` fixture destructured** — The test destructures `addKeyFrame` from the test function argument.
10. **Page objects reused** — The test reuses existing page objects from `app/acceptance/e2e/src/run/pages/` where applicable.
11. **Snapshots taken** — The test calls `await snapshot(...)` at key assertion points.
12. **Tests pass** — Run `/e2e` and confirm all tests pass, including the new one.
