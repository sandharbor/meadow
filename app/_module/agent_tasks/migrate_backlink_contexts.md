# Agent Task: Migrate backlinkContexts into pagespecs

## Context

Commit `c17e92d0` ("Enforce backlinkContexts in pagespec footerSectionBacklinks")
added infrastructure to enforce the full shape of backlink context in pagespecs.
Previously, `footerSectionBacklinks` entries only had `relativeLinkPath`. Now
each entry requires a `backlinkContexts` array describing the see-in-context
links and any embedded links within each context block.

The new YAML structure looks like this:

```yaml
footerSectionBacklinks:
  - relativeLinkPath: ../t011 - special links.html
    backlinkContexts:
      - seeInContextLinkRelativePath: ../t011 - special links.html
        embeddedLinks:
          - linkName: "some page"
            linkRelativePath: "some page.html"
      - seeInContextLinkRelativePath: ../t011 - special links.html
        embeddedLinks: []
```

Each `backlinkContexts` entry has:
- `seeInContextLinkRelativePath` — the path portion (no fragment) of the
  "see in context" link
- `embeddedLinks` — array of `{linkName, linkRelativePath}` for any `<a>` tags
  inside the `.backlink-context` div (often empty)

The test infrastructure is complete but **none of the ~140 source graph pages
have been migrated yet**. Every page with backlinks currently fails the pagespec
test. This task migrates them one at a time.

## Key files

- Type definitions: `app/shared_code/types/test/pagespec.ts`
- Structural validation: `app/shared_code/test/pagespecValidation.ts`
- HTML extractor: `app/system_tests/helpers/htmlLinkExtractor.ts`
- Runtime test: `app/system_tests/tests/pagespecs.test.ts`
- Source graph pages: `app/shared_data/source_graphs/meadow-test-sites-data/`

---

## Task

Each invocation of this task migrates **one** source graph page's pagespec to
include the required `backlinkContexts`.

### Step 1: Identify a page that needs migration

Run the pagespec test and look for the first "Missing backlinkContexts" error:

```bash
cd app && npx vitest run system_tests/tests/pagespecs.test.ts 2>&1
```

Look for lines like:

```
some/page.html: Missing backlinkContexts for backlink "target.html" — pagespec needs updating
```

Pick the first page reported. If there are no "Missing backlinkContexts" errors,
the migration is complete — report success and exit.

### Step 2: Determine the correct backlinkContexts values

Find the corresponding HTML file in
`app/system_tests/expected_results/meadow-test-site-big-preview/` and inspect
the `<footer>` section. For each `<li class="backlink">` that matches the
backlink entry:

1. Find each `.backlink-context-container` within it.
2. Get the `.backlink-see-in-context` anchor's href, strip the `#fragment`,
   URL-decode it — that's `seeInContextLinkRelativePath`.
3. Find all `<a>` tags inside the `.backlink-context` div (excluding the
   see-in-context link) — those are the `embeddedLinks` entries with
   `linkName` (text content) and `linkRelativePath` (decoded href).

### Step 3: Update the source graph page's pagespec

Edit the markdown file in `app/shared_data/source_graphs/meadow-test-sites-data/`
to add the `backlinkContexts` array to the relevant `footerSectionBacklinks`
entry. Update **all** backlink entries for the page, not just the one reported
in the error.

### Step 4: Handle the nested-site spec

Some pages also have a spec for `meadow-test-site-nested`. If so, check the
corresponding HTML in `meadow-test-site-nested-preview/` and update that spec's
backlinks too. If the nested site spec has `footerSectionBacklinks: []` or has
no backlinks, no changes are needed for it.

---

## Verification

After editing the pagespec, run the same test again:

```bash
cd app && npx vitest run system_tests/tests/pagespecs.test.ts 2>&1
```

Confirm that:
- The page you just migrated **no longer appears** in the "Missing
  backlinkContexts" errors.
- The page does **not** produce any new context mismatch errors (if it does,
  the values you entered are wrong — fix them).
- Other pages may still have "Missing backlinkContexts" errors — that's
  expected and will be handled in subsequent runs.

If the migration is fully complete (no more "Missing backlinkContexts" errors),
also run the full check to make sure nothing else broke:

```bash
./quickcheck
```

---

## Important notes

- Migrate only **one page per invocation**. This keeps diffs small and
  reviewable.
- Be precise with paths — they must exactly match what the HTML extractor
  produces (URL-decoded, fragment stripped).
- The `embeddedLinks` array is often empty. That's fine — include it as `[]`.
- Do **not** modify the test infrastructure or type definitions. Only edit
  source graph markdown files.
- Commit the change before exiting with a message like:
  `Add backlinkContexts to pagespec for <page name>`
