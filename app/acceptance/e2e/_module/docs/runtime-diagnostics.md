# Test runtime diagnostics

E2E and agent-eval runtimes accept `MEADOW_TEST_SINGLE_THREADED_GC=1` as an
opt-in diagnostic mode. It passes Node's `--single-threaded-gc` flag to the
backend service, disabling V8 background garbage-collection tasks. Normal
launches and the pinned Node/npm versions remain unchanged. Scenario workers,
assertions, log guardrails, and eval acceptance criteria are unaffected.

Use this only after preserving a native crash report that implicates V8 GC.
Node 24.19.0 on macOS arm64 has crashed in `Scavenger::Process` during complete
test runs, with both Homebrew and official Node binaries. A passing run in this
mode demonstrates the application checks under that runtime configuration; it
does not establish that the upstream native crash is fixed. Record the flag in
run notes and the validation handoff, and retain the failed default-mode runs.

From the repository root:

```sh
MEADOW_TEST_SINGLE_THREADED_GC=1 ./app/acceptance/e2e/_module/scripts/slowcheck \
  --run-notes "Investigate native V8 background-GC crash"
```

For agent evals, set the same variable on the existing `npm run agent-eval`
command in `app/acceptance/e2e`. This flag only changes the test backend service;
it does not configure Desktop, development launches, or installed runtimes.
