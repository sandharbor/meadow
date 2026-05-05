---
name: report-viewer-spec
description: Add, run, or fix bugs exposed by end-to-end tests for the report viewer itself (it has grown into a complicated app in its own right)
---

# Report Viewer E2E Specs

The e2e report viewer (`app/e2e-tests/report-viewer/`) has grown into a
complicated application in its own right, so it needs its own end-to-end
test suite — separate from the main Meadow e2e tests in
`app/e2e-tests/test-runner/tests/`.

When invoked, the user wants to either **add a new spec**, **run the
existing suite**, or **fix a bug a spec exposed**. Use this skill to
establish shared context, then follow the user's specific ask.

## Where everything lives

```
app/e2e-tests/report-viewer/
├── e2e/
│   ├── playwright.config.ts       # two-entry webServer (express + vite)
│   ├── fixtures/
│   │   └── publish-flow-fixture.ts  # ensurePublishFlowArtifact()
│   ├── pages/
│   │   ├── TickNavComponent.ts       # navigate to a specific tick
│   │   └── MeadowHomeFilesComponent.ts  # Files-tab assertions
│   └── tests/
│       └── *.spec.ts              # one spec per file
├── tsconfig.e2e.json              # separate tsconfig for e2e/
└── package.json                    # has "e2e" and "e2e:install" scripts
```

## Page object pattern

Specs should be thin. DOM selectors and interaction sequences belong in
page-object components under `e2e/pages/`, mirroring the convention used
by the main e2e suite (see
`app/e2e-tests/test-runner/src/run/pages/SiteEditorPage/components/FilterPanelComponent.ts`
for the reference).

- One class per logical area of the UI (a tab, a panel, a modal).
- Constructor takes `(page: Page, expect: Expect)`.
- Private getters for reusable locators, public `async` methods for
  actions and assertions.
- Prefer stable `data-*` attribute selectors over structural CSS. The
  ScenarioViewer already exposes `data-idx`, `data-tick-index`,
  `data-file-path`, and `data-file-status`; add more when a new spec
  needs a stable hook rather than relying on class names or text content.

**Existing components:**
- `TickNavComponent.goToTick(n)` — 1-indexed tick navigation via the
  header dropdown. Throws if the tick isn't in the dropdown.
- `MeadowHomeFilesComponent.activate()` / `fileEntry(path)` /
  `expectFileNotModified(path)` / `expectFileCommitted(path)` /
  `getFileStatus(path)`. Prefer `expectFileCommitted` when the intent
  is "this file should have been committed by the app" — it covers
  both `uncommitted-new` and `uncommitted-modified`. Use
  `expectFileNotModified` when the tighter "shouldn't have local edits"
  assertion is what you want.

## How to run the suite

```bash
cd app/e2e-tests/report-viewer

# First time only (or after package-lock changes):
npm install
npm run e2e:install   # installs chromium

# Run the suite:
npm run e2e

# Run a single spec:
npm run e2e -- tests/sanity.spec.ts

# Run with UI / headed mode for debugging:
npm run e2e -- --headed
```

**First-run cost.** The very first run builds the cached publish-flow
fixture, which shells out to the main test-runner CLI and actually runs
`publish-flow.spec.ts` (Docker containers, MinIO, any extension backing
services, the works). Expect it to take a couple of minutes. Subsequent
runs reuse the cache and are fast.

**Port isolation.** The e2e suite runs on dedicated ports **3556** (server)
and **5275** (client) — NOT the `/dev` defaults of 3456/5175. This is
deliberate so the suite works regardless of what dev servers other
worktrees are running. The server and vite configs accept
`REPORT_VIEWER_PORT` and `REPORT_VIEWER_CLIENT_PORT` env vars (defaults
preserved for `/dev`); `e2e/playwright.config.ts` sets them for its
webServer subprocesses and uses `reuseExistingServer: false`.

## The cached publish-flow fixture

All specs share a single fixture: the artifact directory produced by running
`app/e2e-tests/test-runner/tests/publish-flow.spec.ts`.

- **Builder:** `app/e2e-tests/report-viewer/e2e/fixtures/publish-flow-fixture.ts`
  — exports `ensurePublishFlowArtifact()` which returns
  `{ runId, testSlug, artifactDir }`.
- **Cache key:** SHA-256 of `publish-flow.spec.ts` contents (first 12 chars).
- **Stable run id:** `rv-fixture-<key>`.
- **Location:** `~/meadow-e2e-artifacts/current/rv-fixture-<key>/publish-flow-uploads-files-to-minio/`
  (lives under the standard artifacts root so the report viewer server
  can read it with no extra plumbing).
- **Validation:** the fixture is considered present iff `status.txt` in the
  test slug dir says `passed`.
- **How it rebuilds:** shells out to
  `npx tsx src/cli.ts --run-id <stableId> --grep "Publish flow"` inside
  `app/e2e-tests/test-runner/`. Assumes test-runner deps are already installed
  (quickcheck does this). It bypasses `slowcheck.sh` to avoid the
  `npm install --force` on every invocation.
- **Invalidation:** content-hash of the spec file only. Changes to the
  spec's dependencies do NOT invalidate the cache. If you know a dependency
  changed in a way that affects the fixture, manually delete the
  `rv-fixture-*` directory:
  ```bash
  rm -rf ~/meadow-e2e-artifacts/current/rv-fixture-*
  ```

## Per-spec pattern

```ts
import { test, expect } from "@playwright/test";
import {
  ensurePublishFlowArtifact,
  type PublishFlowFixture,
} from "../fixtures/publish-flow-fixture.js";

let fixture: PublishFlowFixture;

test.beforeAll(() => {
  fixture = ensurePublishFlowArtifact();
});

test("...", async ({ page, request }) => {
  const { runId, testSlug } = fixture;
  // API-level assertions: await request.get(`/api/${runId}/${testSlug}/...`)
  // UI-level assertions: await page.goto(`/${runId}/${testSlug}`)
});
```

One test per file. Reuse the cached fixture. Prefer a cheap API-level
sanity check before the UI assertions — it produces a clearer failure
message if the fixture is malformed.

### UI assertion gotchas

- **`Tick X/Y:` counter is hidden until a tick is selected.** On initial
  scenario load, `ScenarioViewer` renders `Tick: --` (dash) until the
  user scrubs the video or picks a tick from the dropdown. Don't assert
  on the `X/Y` text unless your test first selects a tick.
- **Check `hasTicks` via the dropdown button.** The tick dropdown button
  is present whenever `hasTicks=true`, so `page.getByRole("button",
  { name: /^Tick/ })` is a reliable way to prove the client saw ticks
  in the manifest.
- **Breadcrumb as a load indicator.** `page.getByText(testSlug)` being
  visible is a simple proof that the SPA router mounted
  `ScenarioViewer` for the target artifact.

## Useful report-viewer server endpoints

(Served by `app/e2e-tests/report-viewer/src/server/index.ts` on port 3456,
proxied through Vite at 5175.)

- `GET /api/:runId/:testSlug/manifest` — full manifest, includes
  `ticks: ProcessedTick[]`
- `GET /api/:runId/:testSlug/snapshots` — MeadowHome commit snapshots
- `GET /api/:runId/:testSlug/minio-snapshots` — S3/MinIO snapshots
- `GET /api/:runId/:testSlug/state-repos` — extension-contributed state
  repos with their rendering meta (display name, key map, etc.)
- `GET /api/:runId/:testSlug/state-snapshots/:repoName` — snapshots for
  a named state repo
- `GET /api/:runId/:testSlug/state-snapshot/:repoName/:hash` — table
  contents at a state-repo commit

The client route for a scenario is `/:runId/:testSlug`, rendered by
`ScenarioViewer.tsx`.

## Notable facts about the artifact

For the current `publish-flow.spec.ts`, the test slug is
`publish-flow-uploads-files-to-minio` (derived as
`title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()`). If the test title
ever changes, update `PUBLISH_FLOW_TEST_SLUG` in
`publish-flow-fixture.ts`.

## After adding a spec

1. Run `npm run e2e` in `app/e2e-tests/report-viewer/` and confirm it passes.
2. Run `./quickcheck` from the repo root (per project AGENTS.md). If
   changes are limited to `app/e2e-tests/`, the scoped check is faster:
   ```bash
   cd app/e2e-tests && _module/scripts/quickcheck
   ```
   Quickcheck type-checks the e2e/ directory via `tsconfig.e2e.json` but
   does NOT run the Playwright tests — those are opt-in via `npm run e2e`.

## Fixing bugs exposed by a spec (the fix → regenerate → verify loop)

Many specs in this suite are intentionally written to fail *first* —
they are tripwires pointing at real bugs in the Meadow app (e.g.
"`app/app_config.yaml` should not be marked modified at tick 2"). When
the user asks to fix the underlying bug, use this tight loop:

1. **Diagnose at the right layer.** The report viewer just renders what
   `manifest.json` and `ticks.jsonl` tell it. If a file is reported as
   modified/new/etc., check:
   - First, run real `git status` against the saved state repo at
     `~/meadow-e2e-artifacts/current/<runId>/<testSlug>/meadowHome-state-repo`
     (use `--git-dir=.git --work-tree=.`). If git itself agrees with the
     tick data, the bug is NOT in `fast_git_ops` or the report viewer —
     it's upstream in the Meadow app (some code path writes to the file
     without committing).
   - If git disagrees, the bug is in `fast_git_ops` (see
     `app/native_utils/fast_git_ops/fast_git_ops_code/src/main.rs`) or in
     how `test-fixtures.ts` consumes its output.
2. **Fix at the source.** For "file written but not committed" bugs,
   the typical fix site is `app/backend/src/index.ts startServer()`
   where init helpers like `ensureAppConfigInitialized` run. Have the
   init helper report whether it patched the file, and commit when it
   did — not only on first creation. See the existing
   `ensureAppConfigInitialized` / `ensureResourcesConfigInitialized`
   pattern for reference.
3. **Invalidate the cached fixture.** The fixture builder only
   rebuilds when the spec file's content hash changes, so after an app
   fix you must manually clear the cache:
   ```bash
   rm -rf ~/meadow-e2e-artifacts/current/rv-fixture-*
   ```
4. **Regenerate + verify.** Run `npm run e2e` in
   `app/e2e-tests/report-viewer/`. The fixture builder will rerun
   `publish-flow.spec.ts` (slow, ~20s) to produce a fresh artifact, then
   Playwright runs every spec against it. Confirm the target spec flips
   from red to green — and that no other spec regresses.
5. **Run `./quickcheck`** from the repo root to catch any type or lint
   fallout from the app-side fix.
6. **Repeat** if the spec is still red — the fix wasn't sufficient, or
   the bug lives somewhere else than you thought. The cycle is cheap
   because step 3 is one command and step 4 is automated.

**Cache key caveat.** The fixture cache key is a hash of
`publish-flow.spec.ts` alone — it does NOT invalidate when the Meadow
app code changes. That's why step 3 is mandatory for app-side fixes.

**Adjacent-bug heuristic.** When you fix one "written but not
committed" bug, look at the same startup sequence for sibling bugs in
the same family, then have the user decide whether to add sibling
specs before or after the fix. Writing the failing spec first is
valuable because it proves the tripwire works.

## Flakiness policy

Per project AGENTS.md: flaky tests are never acceptable. If a spec fails
sometimes and passes sometimes, fix the root cause — don't retry it away.
An **intentionally failing** regression spec (tripwire for an unfixed
bug) is NOT flakiness — it's a controlled, deterministic failure that
should stay red until the underlying bug is fixed. Don't silence or
skip such specs; the failure is the signal.
