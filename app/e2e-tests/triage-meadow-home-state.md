# `assertMeadowHomeState()` triage

After landing the new fixture (commit ad0c9c0), 17 specs fail because they
leave unexpected state in the MeadowHome configDir. Each one needs a deliberate
decision:

- **Allow-list** — state is intentional; pass the paths to
  `assertMeadowHomeState({ allowedUntracked: [...], allowedModified: [...] })`.
- **Fix the test** — the state is a test bug; clean up before the assertion.
- **Fix the app** — the state reveals an app bug; fix the underlying behavior.
- **Skip explicitly** — the test deliberately doesn't care about MeadowHome
  state at the end; replace `assertMeadowHomeState()` with
  `skipMeadowHomeStateCheck()` (also added to the fixtures and accepted by
  the linter as an explicit opt-out).

Workflow per spec:

1. Run solo via `slowcheck --grep "<title>"`.
2. Open `/packet` to inspect.
3. Decide on a fix.
4. Apply — fix may resolve multiple specs.
5. Check off everything resolved.
6. Pick the next unchecked one and repeat.
7. When the list is empty, run `/e2e` to confirm.

## Failing specs

- [ ] add example site from empty state and preview it
- [ ] blacklisting a single page removes it from the rendered preview
- [ ] callout for marking source node sensitive the first time
- [ ] Callout preview warns about untracked pages
- [ ] Change type filter shows correct counts and interacts with HTML section filter
- [ ] Changes tab lifecycle: new files, save, modify via config, verify diff headers
- [ ] Delete unpublished site from within site editor
- [ ] empty solo callout appears when solo filter hides all pages
- [ ] excalidraw thumbnail in list view, embedded in preview, and standalone page
- [ ] filter custom inlink title substring selects expected pages
- [ ] find in sites shows archived match indicator and archived tab
- [ ] Hooks preview shows normalized title and editing hook updates it
- [ ] HTML post-processing hook: create, validate, save, and verify diff
- [ ] HTML section changes filter correctly reflects changes after save and customization
- [ ] Preview reopens on Review step after tracking pages via Check Them link
- [ ] S3 provider publishes and deletes a site via MinIO
- [ ] setting initial-page inlink depth to 0 keeps the depth-1 outlink media visible
