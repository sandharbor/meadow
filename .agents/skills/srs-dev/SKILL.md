# /srs-dev — SRS Component Development

Fast iteration on the SRS spaced-repetition UI and core logic.

**Scope**: Only `app/published_site_utils/srs/`. Do not touch files outside this directory. Do not build artifacts for the main app (`npm run build`, `npm run sync:backend`) — those are done explicitly when needed.

## After making changes

Run the quick checks (lint + unit tests only) from the project directory:

```bash
cd app/published_site_utils/srs && npx tsc --noEmit && npx eslint . && npx vitest run --config vitest.config.ts --dir src/core_logic
```

Do **not** run e2e tests (`src/e2e`) unless explicitly asked. They are slower and involve heavier fixtures.

Do **not** run `./quickcheck` (the repo-wide check script). We stay scoped to this directory for speed.

## Dev server — ALWAYS start immediately

When this skill is invoked, **always start the dev server and open the browser right away**, even if the user hasn't asked for anything specific yet. Do not wait for further instructions.

The Vite dev server (`npm run dev` in `app/published_site_utils/srs`) serves the SRS dev harness at the root URL. It hot-reloads on save. The dev harness lives in `src/dev/` and uses sample data from `src/dev/samplePages.ts` and mock global cards from `src/dev/globalCardsMock.ts`.

Start the dev server and open the browser:

```bash
cd app/published_site_utils/srs && npx vite &
```

Wait for the "ready" line in the output to get the URL, then open it:

```bash
open http://localhost:<port>/
```

## Key directories

| Path | Purpose |
|------|---------|
| `src/core_logic/` | Pure logic: scheduler, state, card parsing, types |
| `src/ui/` | DOM controller, overlay, styles |
| `src/dev/` | Dev harness: sample pages, mock data, main entry |
| `src/e2e/` | End-to-end tests (run only when asked) |
