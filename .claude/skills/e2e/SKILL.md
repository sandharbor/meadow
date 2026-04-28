---
name: e2e
description: Run the end-to-end test suite, automatically diagnose and fix failures
---

# Run E2E Tests

Run the end-to-end tests. If any test fails, immediately investigate and fix
the failure — that's the whole point of running inside an agent.

## Step 0: Determine run notes

Before running the tests, decide on a short note describing **why** this run
is happening. This gets saved alongside artifacts so runs are easy to
understand at a glance later.

Determine the note automatically from context:

- **Post-merge verification**: "Verifying main after merging branch
  `<branch-name>`" (if you just merged or the user asked to run after a merge).
- **Main health check**: "Routine check that main is green" (if
  already on main with no special context).
- **Specific reason from the user or agent**: Use whatever reason was stated,
  e.g. "Checking whether the callout refactor broke publish flow".
- **Worktree runs**: The worktree name is already captured in the run ID, so
  you don't need to repeat it. But if there's a specific reason for the run
  within that worktree, include it.

Keep notes to 1-2 sentences.

## Step 1: Run the tests

Pass the note via the `--run-notes` flag:

```bash
./app/e2e-tests/test-runner/_module/scripts/slowcheck --run-notes "<your note here>"
```

This runs the full Playwright test suite (all specs in `app/e2e-tests/test-runner/tests/`),
assembles artifacts, and reports results.

### Running a single test

If arguments were passed to `/e2e` (e.g. `/e2e html-post-processing-hook`),
use `--grep` to filter to only matching test(s):

```bash
./app/e2e-tests/test-runner/_module/scripts/slowcheck --run-notes "<note>" --grep "<pattern>"
```

The grep pattern is passed to Playwright's `--grep` flag, which matches
against test titles. When `--grep` is active, the artifact count guardrail
is skipped (since not all specs will run).

### Running tests for specific scenario docs

If the user asks to run tests for specific "scenario docs" or "scenarios" (they
may not use exact names), use `--scenarios` to filter by scenario doc ID:

```bash
./app/e2e-tests/test-runner/_module/scripts/slowcheck --run-notes "<note>" --scenarios callout publishing
```

This finds all spec files that import the given scenario docs and runs only
those. To see available scenario doc IDs, look at the filenames in
`app/e2e-tests/test-runner/src/scenario-docs/` (strip the `.ts` extension, skip
`types.ts` and `index.ts`). If you pass an invalid name, the error output
lists all valid IDs.

This is useful for faster feedback when you know which area of the app changed.
`--scenarios` and `--grep` are mutually exclusive.

### Highlighting specs for reviewer focus

When you run the full suite from a feature or bugfix branch, use `--highlighted`
to mark the specs the reviewer should look at first. Unlike `--scenarios`, this
does **not** filter the run — every spec still runs. It only annotates the
report viewer so the highlighted specs land in a dedicated "Highlighted" section
above the normal Failing / Passing sections (thumbs, list, and videos tabs),
and their scenario docs glow amber in the filter chips.

```bash
./app/e2e-tests/test-runner/_module/scripts/slowcheck --run-notes "<note>" --highlighted delete-then-republish
```

Pass one or more spec basenames (the filename without `.spec.ts`). If a name
doesn't match any spec, the CLI prints the full list of valid basenames and
exits. `--highlighted` and `--scenarios` are mutually exclusive — highlighting
only makes sense when you're running a large/whole-suite run. Prefer using it
whenever you're working on a specific spec during a feature/bugfix branch so
`/packet` surfaces the scenario immediately for review.

## Step 2: If tests fail, fix them

**Flaky tests are never acceptable.** A test that passes sometimes and fails
sometimes is not "basically passing" — it is broken and must be fixed before
you move on. Flaky tests destroy trust in the suite and slow down shipping.
They are the single most corrosive thing that can happen to a codebase. Do
not dismiss a failure as "just flaky" and proceed. If a test fails, it is
your job to make it pass reliably, every time, under full parallel load.

**Never conclude a test is "flaky but fine."** If a test fails in the full
suite but passes solo, that is a real bug — likely a timing issue, a missing
wait, or shared state pollution. Diagnose and fix the root cause.

When a test fails, don't stop. Diagnose and fix the failure:

1. Read the test output carefully — Playwright prints the failing assertion,
   the test file, and line number.
2. Read the failing test spec in `app/e2e-tests/test-runner/tests/`.
3. Determine whether the failure is in the test or in the application code:
   - **Timing issue in test**: add appropriate waits, fix selectors, or
     adjust assertions. A test that fails under parallel load but passes
     solo has a timing bug — find it and fix it.
   - **Application bug**: trace through the relevant app code and fix it.
   - **Infrastructure issue** (Docker not running, port conflict): report to
     the user rather than trying to fix.
4. After fixing, re-run the **full suite** (not just the single test) to
   confirm the fix works under parallel load.
5. Run quickcheck to make sure nothing else broke. If the changes are
     limited to `app/e2e-tests/` code (test specs, report viewer, etc.), use
     the scoped quickcheck for faster feedback:
     ```bash
     cd app/e2e-tests && _module/scripts/quickcheck
     ```
     If application code was also changed, run the full `./quickcheck` from
     the repo root instead.

### Stability agent task

If you encounter flaky failures and need a dedicated, thorough stability pass,
run the `e2e_full_suite_stability` agent task:

```bash
tools/agent_task/run_agent_task app/e2e-tests/test-runner/_module/agent_tasks/e2e_full_suite_stability.md
```

This task is purpose-built for ferreting out flaky tests. It runs the full
suite, verifies deterministically with the status command, diagnoses any
failures, fixes them, and repeats until the suite is fully stable. Use it
whenever you see intermittent failures — do not hand-wave them away.

### Key files for debugging

- `app/e2e-tests/test-runner/tests/*.spec.ts` — test specs
- `app/e2e-tests/test-runner/src/run/test-fixtures.ts` — custom Playwright fixtures (`artifactDir`, `snapshot`)
- `app/e2e-tests/test-runner/src/run/pages/` — page object models used by tests
- `app/e2e-tests/test-runner/playwright.config.ts` — test configuration, Docker container setup
- `~/meadow-e2e-artifacts/` — test run output (videos, logs, state snapshots)

### Checking pass/fail after a run

The Playwright stdout may be truncated for large test suites. To reliably
determine which tests passed or failed, check **`status.txt`** inside each
test's artifact directory:

```bash
for dir in ~/meadow-e2e-artifacts/<run-id>/*/; do
  name=$(basename "$dir")
  st=$(cat "$dir/status.txt" 2>/dev/null || echo "no-status")
  echo "$st $name"
done
```

Do NOT look for `FAILED` marker files — they don't exist. The `status.txt`
file contains the Playwright status string (`passed`, `failed`, etc.).

For failure details, check `manifest.json` in the test's artifact directory
(it contains the test source, snapshots, and logs) and
`error-context.md` in `app/e2e-tests/test-runner/test-results/<test-dir>/`
(it contains the page snapshot at the time of failure).
