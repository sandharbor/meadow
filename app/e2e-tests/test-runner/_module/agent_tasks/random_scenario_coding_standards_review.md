# Random Scenario Coding Standards Review

## Goal

Pick a random e2e scenario and make it conform to the coding standards in
`e2e-tests/test-runner/_module/docs/coding_standards.md`. You may also refactor shared code
(page objects, workflows) to drive towards the standards.

## Steps

### 1. Find all scenario files

List all `.spec.ts` files in `e2e-tests/test-runner/tests/`.

### 2. Pick one at random

Run a Python script to get a truly random selection:

```bash
python3 -c "import random, glob; files = sorted(glob.glob('e2e-tests/test-runner/tests/*.spec.ts')); print(files[random.randint(0, len(files)-1)])"
```

### 3. Review against coding standards

Read `e2e-tests/test-runner/_module/docs/coding_standards.md` and then read the selected
scenario file. Check for violations of each standard:

- **One test per spec file** — Does the file contain exactly one `test(...)` call?
- **Use workflows for navigation** — Is navigation inlined when a `Workflows`
  method exists or should be created? Read `e2e-tests/test-runner/src/run/workflows.ts` to
  check.
- **Page objects own their selectors** — Are there locator strings duplicated
  across methods in any page objects the scenario uses? Read the relevant page
  objects in `e2e-tests/test-runner/src/run/pages/`.
- **No inline selectors in tests** — Does the test use raw `page.locator(...)`
  for interactions that should live in a page object?

### 4. Fix any violations

If the scenario violates any standard, fix it. This may involve:

- Extracting inline selectors into page object methods
- Creating new page object methods or private getters
- Moving navigation sequences into `Workflows`
- Splitting a multi-test file into separate spec files

Keep changes minimal and focused. Don't refactor things that already conform.

### 5. Verify and commit (only if changes were made)

If you made any changes:

1. Run `./quickcheck` — must pass
2. Run the `/e2e` skill — all tests must pass including the modified scenario
3. If all checks pass, commit the changes with a descriptive message explaining
   what coding standard violations were fixed and in which scenario. Push to
   main.

If no changes were needed, report that the scenario already conforms and skip
verification.
