---
name: scenario
description: Create a new end-to-end test scenario
---

# Create E2E Scenario

Create a new end-to-end test scenario. Follow the patterns established by
existing scenarios.

## Step 1: Understand the request

The user will describe what the scenario should test. They may also mention
scenario docs they want to create or attach to.

## Step 2: Study existing patterns

Read the existing test specs, page objects, and workflows to follow established
conventions:

- `app/e2e-tests/test-runner/tests/*.spec.ts` — existing test scenarios
- `app/e2e-tests/test-runner/src/run/workflows.ts` — composable navigation helpers (use these first!)
- `app/e2e-tests/test-runner/src/run/pages/` — page object models
- `app/e2e-tests/test-runner/src/scenario-docs/` — scenario doc definitions
- `app/e2e-tests/test-runner/src/run/test-fixtures.ts` — custom fixtures (`artifactDir`, `snapshot`, `addKeyFrame`)

## Step 3: Create the scenario

### CRITICAL: Structure Rules

Read and follow the coding standards in
[`app/e2e-tests/test-runner/_module/docs/coding_standards.md`](../../../app/e2e-tests/test-runner/_module/docs/coding_standards.md).

### Creating the spec file

1. Create the new test spec in `app/e2e-tests/test-runner/tests/` — **one test per file**.
2. Wire up scenario docs (create new ones or reuse existing) — see below.
3. Add keyframe captures at meaningful moments — see below.
4. Use workflows for navigation and page objects for interactions.

### Scenario Docs and Keyframes

Every test must be tied to at least one **Scenario Doc** via a **keyframe**.
This is how tests are categorized and visually documented in the report viewer.

**Scenario Docs** describe broad functional areas of the app (e.g. "Publishing",
"HTML Generation", "S3"). Think of them as rich area tags — but instead of
plain string tags, each one is a small document with an `id`, `name`, and
`description` that explains what the area covers. They are defined in
`app/e2e-tests/test-runner/src/scenario-docs/`:

```typescript
// app/e2e-tests/test-runner/src/scenario-docs/publishing.ts
export const publishing: ScenarioDoc = {
  id: "publishing",
  name: "Publishing",
  description: "Tests the publish flow including S3/MinIO uploads...",
};
```

New scenario docs must be registered in `app/e2e-tests/test-runner/src/scenario-docs/index.ts`.

The relationship between tests and scenario docs is **many-to-many**. A single
test often touches multiple functional areas, so it imports and tags multiple
scenario docs. Conversely, a single scenario doc (like `s3`) may appear across
many different tests. When creating a scenario, import whichever existing
scenario docs are relevant — and create new ones only for areas not yet covered.

**Keyframes** are the mechanism that links tests to scenario docs. Calling
`await addKeyFrame(scenarioDoc)` does two things:
1. Takes a screenshot saved as `keyframe-{docId}.png` in the artifact directory
2. Links that screenshot to the scenario doc so the report viewer can display
   it as a visual checkpoint, filtered by scenario doc

**Every test must call `addKeyFrame` at least once.** Capture a keyframe at the
moment that best represents each functional area being tested — typically right
after the key UI state is reached.

Example — a test using workflows and covering multiple areas:

```typescript
import { test, expect } from "../src/run/test-fixtures.js";
import { invites, publishing } from "../src/scenario-docs/index.js";
import { Workflows } from "../src/run/workflows.js";

test("Valid invite code grants publish access", async ({
  page, snapshot, addKeyFrame, testServer,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigSiteShareTab();
  // ... test-specific interactions ...
  await addKeyFrame(invites);
  await addKeyFrame(publishing);
  await snapshot("valid invite code - publish access granted");
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
its scenario-doc chips amber. See the `/e2e` skill for details.

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
5. **Test spec exists** — A `.spec.ts` file exists in `app/e2e-tests/test-runner/tests/` for the scenario.
6. **Scenario docs identified** — The test imports one or more scenario docs covering all functional areas it touches. Existing docs are reused where applicable; new docs are created only for areas not yet covered.
7. **New scenario docs registered** — Any newly created scenario docs are exported from `app/e2e-tests/test-runner/src/scenario-docs/index.ts`.
8. **Keyframes captured** — The test calls `await addKeyFrame(scenarioDoc)` at least once per scenario doc it imports, at a meaningful moment for that area.
9. **`addKeyFrame` fixture destructured** — The test destructures `addKeyFrame` from the test function argument.
10. **Page objects reused** — The test reuses existing page objects from `app/e2e-tests/test-runner/src/run/pages/` where applicable.
11. **Snapshots taken** — The test calls `await snapshot(...)` at key assertion points.
12. **Tests pass** — Run `/e2e` and confirm all tests pass, including the new one.
