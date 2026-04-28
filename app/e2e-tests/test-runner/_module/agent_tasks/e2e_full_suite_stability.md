# E2E Full Suite Stability

## Goal

Run the entire e2e test suite and ensure every test passes with no errors or
warnings. If any test fails, diagnose the root cause and fix the flakiness or
bug so the suite is stable.

This task is designed to be run repeatedly by the agent task manager. Each
invocation must leave the suite in a fully passing state.

## Steps

### 1. Run the full e2e suite

Use the `/e2e` skill to run all end-to-end tests.

### 2. Verify the run with the status command

The `/e2e` skill is not always precise about whether the run truly passed —
it may report success even when there were warnings or partial failures.
**You must always verify deterministically** by running the status command.

Find the most recent run ID and check it:

```bash
cd e2e-tests/test-runner && LATEST_RUN=$(ls -t ~/meadow-e2e-artifacts/current/ | head -1) && npx tsx src/cli.ts --status "$LATEST_RUN"
```

The `--status` command reads the assembled artifacts and checks three things:
- Every spec file produced an artifact directory (no missing tests)
- Every test's `status.txt` says `passed`
- No scenario has errors or warnings in `run-report-meta.json`

It exits 0 **only** if all three conditions hold. If it exits non-zero, the
run had failures — proceed to step 3.

If the status check passes (exit 0), skip to step 5.

### 3. Diagnose failures

For each failing test reported by the status command:

1. Read the test file in `e2e-tests/test-runner/tests/`.
2. Check the test's artifact directory under `~/meadow-e2e-artifacts/current/<run-id>/`
   for `backend.log`, `frontend.log`, `manifest.json`, and screenshots that
   reveal what happened.
3. Read the relevant page objects in `e2e-tests/test-runner/src/run/pages/` and
   workflows in `e2e-tests/test-runner/src/run/workflows.ts` to understand what
   the test was doing when it failed.
4. Determine whether the failure is:
   - **A flaky selector/timing issue** — a locator race, missing `waitFor`, or
     an action that fires before the UI is ready.
   - **A flaky infrastructure issue** — container startup timing, port
     conflicts, stale state from a prior run.
   - **A real bug** — application code that is genuinely broken.

### 4. Fix the issue and re-run

Apply the minimal fix:

- **Timing/selector flakiness**: add an explicit `waitFor` or
  `expect(...).toBeVisible()` guard before the interaction. Prefer Playwright's
  built-in auto-waiting (action methods like `click`, `fill` already wait for
  actionability) — only add extra waits when the failure shows the element was
  not yet in the DOM or a navigation hadn't completed.
- **Infrastructure flakiness**: fix the setup/teardown in the fixture or helper
  scripts.
- **Real bug**: fix the application code in `app/`.

Do NOT:
- Add arbitrary `page.waitForTimeout(...)` sleeps — these hide problems and
  slow the suite down.
- Disable or skip failing tests.
- Weaken assertions to make them pass.

After fixing, go back to step 1. Repeat until the status command reports all
tests passed.

### 5. Verify and commit (only if changes were made)

If you made any changes:

1. Run `./quickcheck` — must pass.
2. Commit the changes with a descriptive message explaining what flakiness was
   fixed and in which test(s). Push to main.

If no changes were needed (suite passed on the first run), report success and
exit.
