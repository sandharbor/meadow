# verify_extended_syntax

Playwright-driven visual + DOM check for the `t025 - extended syntax` test page.

Loads the rendered preview HTML (from `app/system_tests/expected_results/meadow-test-site-big-preview/`) in a real Chromium browser, saves a full-page screenshot, and probes the DOM for each extended-syntax feature listed on <https://www.markdownguide.org/extended-syntax/>, reporting which features render properly vs. fall through as raw markdown.

## Usage

```bash
cd tools/verify_extended_syntax
npm install
npm run install:browsers   # first time only
npm run verify
```

The screenshot is written to `t025-rendered.png` in this directory.

## Regenerating the source HTML

The script reads the already-rendered HTML from `expected_results/`. If the source markdown or renderer changes, regenerate it first with:

```bash
cd app/system_tests && npm test -- preview
```

Then re-run `npm run verify`.
