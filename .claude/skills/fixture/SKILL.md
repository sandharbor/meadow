---
name: fixture
description: Understand and extend the regenerable canonical scenario artifact in the e2e report viewer — used for iterating on the viewer's UI against stable, self-documenting data without running real tests
---

# Canonical Fixture Scenario

The report viewer's "Open test scenario artifact" menu opens a
deterministic scenario that's regenerated from factory scripts on every
page refresh. It exists so anyone can iterate on the viewer's UI
against stable, self-documenting data — edit a factory, refresh, see
the change. No real Playwright run required.

This skill explains how the fixture works so you can extend or maintain
it without breaking its invariants.

## Where everything lives

```
app/e2e-tests/report-viewer/src/server/fixture-scenario/
├── index.ts                     # generateFixtureScenario() — orchestrator
├── CanonicalScenarioBuilder.ts  # the API the scenario script talks to
├── canonical-scenario.ts        # the actual story (the file you most often edit)
├── Ticker.ts                    # fake clock + monotonic tick indices
├── Logger.ts                    # frontend.log / backend.log writers
├── StateRepoBase.ts             # git-repo wrapper with fake-clock commit dates
├── MeadowHomeFs.ts              # addFile / appendLine / commit
├── MinioStore.ts                # putObject (S3 mock)
├── StateStore.ts                # generic State tab — fixture-state-repo
└── assets/mock-video.webm       # 5-second silent placeholder
```

Server-side wiring is in `app/e2e-tests/report-viewer/src/server/index.ts`:

- The middleware on `/api/__fixture/canonical` regenerates the artifact
  when the newest mtime under `fixture-scenario/` changes.
- The runs-list endpoint filters out anything starting with `__`, so
  the fixture is reachable only via the menu (or direct URL).

Client-side menu is in
`app/e2e-tests/report-viewer/src/client/main.tsx` (`AppActionsMenu`).

## How a request becomes an artifact

1. Browser hits `http://localhost:5175/__fixture/canonical`.
2. The React app fires its usual fan-out of API calls under
   `/api/__fixture/canonical/...`.
3. The express middleware checks the newest mtime under
   `fixture-scenario/`. If anything changed since the last regen, it
   wipes `~/meadow-e2e-artifacts/current/__fixture/canonical/` and runs
   the factories.
4. The factories write the same input files a real test would write
   (`ticks.jsonl`, `frontend.log`, state repos as git histories with
   fake-clock commit dates, etc.).
5. `assembleTestArtifacts()` (from `test-runner/src/artifacts/assemble.ts`,
   the same one a real run uses) turns the inputs into `manifest.json`
   and `report-meta.json`.
6. Concurrent API calls during one page load share a single inflight
   regen so they all see consistent state.

The fixture is intentionally driven through the **real** assembler. If
the assembler's input contract changes, the fixture breaks the same way
real tests would. That's the point.

## The fake-clock model

`Ticker` is the single source of truth for time inside the fixture. It
holds a fake epoch (currently `2026-01-01T12:00:00.000Z`), an offset in
ms, and a monotonically-increasing tick index. Every timestamp the
artifact contains comes from the ticker — log lines, git commit dates
(via `GIT_AUTHOR_DATE` / `GIT_COMMITTER_DATE` env vars in
`StateRepoBase.commit()`), `ticks.jsonl` rows, snapshot times.

This means generation runs in real-time as fast as Node + git allows,
but the artifact *describes* whatever fictional duration the scenario
walks through (currently ~5 seconds). Don't reach for `Date.now()` or
`new Date()` anywhere inside `fixture-scenario/`.

## Tick semantics — the convention you must preserve

Each `b.advance(N); // begin T_n` line:

- Advances the fake clock by `N` ms
- Bumps the tick index to `n`
- Marks T_n as "open" — the operations between this advance and the
  next happen *during* T_n
- The row written to `ticks.jsonl` for T_n reflects the state at the
  *end* of T_n (after all of T_n's operations have run)

Implementation detail: `CanonicalScenarioBuilder` defers the tick row
write until the next `advance()`, the next `snapshot()`, or
`finalize()`. This is why a file added at T2 shows up correctly in T2's
row. **Do not** write the row eagerly inside `advance()`; that
re-introduces a bug where events get attributed to the wrong tick.

Snapshots replace any pending non-snapshot row at the same tick — there
is exactly one row per tick.

## Self-documenting stamps

Every observable item carries the tick that produced it:

- Frontend log line: `<ISO> [info] T<n>: <message>`
- Backend log line: `<ISO> - [INFO ] T<n>: <message>`
- New file in MeadowHome: filename `T<n>-<basename>` and a header
  `# created at T<n> (<ISO>)`
- Line appended to a tracked file: trailing `// appended at T<n>`
- MeadowHome commit message: `C<n>: <message>`
- Snapshot label: `S<n>: <message>` (also propagated as the commit
  message on the MinIO and State repos at that moment)
- Object key in MinIO: `T<n>-<key>`
- State record file: `T<n>-<recordId>.yaml`

When you scrub the timeline in the viewer, scrubbing to T_n should
reveal log lines prefixed `T<n>:`, files named `T<n>-...`, etc., all
coherent at a glance. Preserve this when adding new operations.

## How to make changes

### Tweak the story

Edit `canonical-scenario.ts`. Refresh the browser tab. The middleware
detects the source change via mtime and regenerates. Common edits:

```ts
// Add a log
b.advance(150); // begin T_n
b.frontendLog("warning", "Out of disk");

// Add an untracked file
b.advance(100); // begin T_n
b.addMeadowFile("notes.md", "Some content\n");

// Modify a previously-added file (use its stamped name)
b.advance(100); // begin T_n
b.appendMeadowLine("T_m-notes.md", "another line");

// Commit MeadowHome — labels itself "C<n>: <msg>"
b.advance(100); // begin T_n
b.commitMeadowHome("save notes");

// Take a snapshot — labels itself "S<n>: <msg>"
b.advance(100); // begin T_n
b.addKeyFrame("notes-saved", "keyframe-notes-saved.png");
b.snapshot("notes saved");

// Drop an S3 object
b.advance(100); // begin T_n
b.putObject("sites/foo/index.html", "<!doctype html>");

// Set a State record (the generic "State" tab)
b.advance(100); // begin T_n
b.setStateRecord("users", "alice", "id: alice\n");
```

### Add a new builder method

Add it to `CanonicalScenarioBuilder.ts`. The convenience methods all
follow the same pattern: read `this.current()` for the tick stamp,
delegate to the underlying repo/logger, and let *its* method weave
`T<n>` into whatever it produces. Don't take a tick argument from the
caller — the convention is that the current tick is implicit.

### Add a new state repo

Subclass `StateRepoBase` (see `MinioStore` and `StateStore` for the
pattern). Pick a name ending in `-state-repo` and pass an optional
`_meta.json` for `displayName`/`pathPrefix`. The assembler discovers it
automatically via the naming convention; the viewer renders it as an
extra tab.

### Change the scenario duration

`canonical-scenario.ts` controls duration through its `b.advance(N)`
calls; the totals add up to whatever fake-clock span you need. The
`mock-video.webm` is currently 5 seconds — if you stretch the scenario
significantly past that, regenerate the video to match (see "Mock
video" below).

## Diagnostics — inspecting what's on disk

The artifact lives at:

```
~/meadow-e2e-artifacts/current/__fixture/canonical/
```

Useful one-liners while debugging:

```bash
# Force a regen and inspect the first 12 tick rows
cd app/e2e-tests/report-viewer
rm -rf ~/meadow-e2e-artifacts/current/__fixture
npx tsx -e "import('./src/server/fixture-scenario/index.ts').then((m) => m.generateFixtureScenario())"
head -13 ~/meadow-e2e-artifacts/current/__fixture/canonical/ticks.jsonl | \
  jq -c '{i: .tickIndex, snap: .isSnapshot, files, uncomm: (.uncommittedFiles|map(.status+" "+.path)), head: (.gitHeadSha[0:8])}'

# See what the snapshot pane will show
jq '.snapshotMeta | map({h: (.commitHash[0:8]), msg: .commitMessage, files: (.changedFiles|length)})' \
  ~/meadow-e2e-artifacts/current/__fixture/canonical/manifest.json

# Confirm the State tab will be labeled generically
jq . ~/meadow-e2e-artifacts/current/__fixture/canonical/fixture-state-repo/_meta.json
```

## Invariants to preserve when modifying

1. **Determinism.** Same source code → identical output (same SHAs,
   same timestamps). Don't introduce wall-clock dates, random IDs, or
   `Math.random()`. The fake clock is the only time source.
2. **Tick rows reflect end-of-tick state.** Don't write a tick row
   inside `advance()`; defer until the next transition.
3. **One row per tick.** A snapshot row replaces any pending
   non-snapshot row at the same tick.
4. **No phantom uncommitted files.** Anything written into a state
   repo's working tree that isn't real "state" must be in
   `.git/info/exclude` (see how `timeline.jsonl` is handled in
   `StateRepoBase`).
5. **Open-core boundary.** This fixture is part of the open-core
   report viewer. Keep its tab labels and copy generic; the State tab
   is deliberately labeled "State", not anything specific to a backing
   store.

## Gotchas

- **`git status --porcelain` output.** Don't `.trim()` the raw output
  before splitting — leading spaces (` M filename`) are part of the
  format and trimming will shift slice indices and chew the first
  character off the path. `StateRepoBase.uncommittedFiles()` does this
  correctly; copy that pattern if you write similar parsers.
- **Filename rewriting.** `MeadowHomeFs.addFile()` returns the
  *stamped* name (`T<n>-<basename>`). When you later `appendMeadowLine`
  to it, you must use the stamped name, not the original.
- **`__fixture` filtering.** The runs-list endpoints filter out names
  starting with `__`. Don't drop those filters when refactoring; the
  scenario shouldn't appear as a real run.
- **Mtime caching.** The middleware caches against the newest mtime
  under `fixture-scenario/`. If you add a new generated input that
  doesn't live under that directory (unlikely, but possible), the
  cache won't invalidate when you edit it. Keep all source files
  under `fixture-scenario/`.

## Mock video

`assets/mock-video.webm` is a 5-second silent webm copied into the
artifact dir as `video.webm`. The viewer's video player needs a real
file to render; a missing or zero-byte file would 404. Regenerate with:

```bash
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "color=c=#1f2937:s=640x360:d=5" \
  -f lavfi -i "anullsrc=r=44100:cl=mono" \
  -shortest -c:v libvpx -b:v 50k -c:a libvorbis -pix_fmt yuv420p \
  app/e2e-tests/report-viewer/src/server/fixture-scenario/assets/mock-video.webm
```

If you change the scenario's fake-clock duration, regenerate the video
to match (the player won't error if they disagree, but the scrubber
mapping won't be useful).

## Running the viewer

```bash
cd app/e2e-tests/report-viewer
npm run start    # concurrently runs server (3456) and Vite (5175)
```

Open http://localhost:5175 → top-right `…` → **Open test scenario
artifact**. Edit any file under `fixture-scenario/` and refresh the
browser to see the change immediately.
