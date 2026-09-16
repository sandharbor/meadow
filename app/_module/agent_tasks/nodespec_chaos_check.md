# Chaos Testing Scenario: nodespec Validation

## Core Principle

A central concern in this testing scenario is **avoiding situations where tests
pass when they should fail**.

The goal of this approach is to deliberately introduce inconsistencies into this
part of the system and verify that the test suite **detects those
inconsistencies and fails appropriately**.

If a modification that should invalidate a node specification still results in
the tests passing, that indicates a flaw in the validation or test coverage.

---

# Background

I am suspicious of the node spec files paired with the source nodes in
`app/shared_data/source_graphs`.

nodespecs are intended to **very carefully and precisely specify properties of
pages within the fixture context in which they are used**. However, repeated
discrepancies have been observed.

Every source format uses `<full-source-filename>.nodespec.yaml` in the same directory. Specs are never embedded in source content. Node spec entries are organized by system area:

```yaml
nodespecs:
  - bundle: meadow-test-bundle-big
    sourcing:
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /some page.md
            isInGraph: true
        inlinks: []
    curation:
      isTracked: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: some page.html
        footerSectionBacklinks: []
```

The `sourcing` section describes working graph membership, graph links, and
frontier/orphan status. The `curation` section describes tracked state and filters.
The `generation` section describes rendered HTML expectations.

These discrepancies appear to arise for several reasons:

### 1. Incorrect Specifications

Some nodespecs were originally generated automatically as part of bootstrapping
the system. These generated specs may not have been carefully reviewed.

### 2. Incomplete Validation Checks

We didn't ensure that the things we were checking were comprehensive.

### 3. Disabled Validation Checks

Some validation logic appears to have been stubbed out or disabled in the test
framework.

This may have happened when too many changes were introduced at once and the
coding agent became overwhelmed, leaving temporary stubs in place.

Because of these issues, it is possible that the system currently allows
**invalid node specifications to pass validation silently**.

---

# Chaos Testing Approach

To identify weaknesses in the validation system, we will run a **chaos-style
testing scenario**.

In this case, you are an agent operating inside of an externally controlled loop.

1. Ensure that the working directory is clean (nothing un-committed or untracked in git).
   If it is obviously left-over from an earlier run, you can undo the modification,
   but otherwise report an error and exit.
2. Randomly select one of the task types defined below (use a quick python
script to get an _actual_ random number given the number of tasks, please)
3. Perform the task
4. Attempt to create a situation that should cause validation to fail.
5. Run the root-level test checks.
6. Report the outcome in a structured format described below.

Each invocation performs **exactly one task**, after which the agent exits and
reports the result.

The agent is also allowed to **fix issues that it discovers** if the fix is
small and localized.

Because the scenario runs repeatedly in an external loop:

- One run may discover and fix an issue.
- Later runs will operate on the updated codebase and may discover additional
issues.

---

# Task Types

Each task type has:

- A **Task Identifier**
- A **Short Description**
- A **Detailed Behavior Specification**

These identifiers will be included in the structured output produced by the agent.

---

## Task: `CODE_REVIEW`

**Short description:**  
Inspect nodespec-related code and attempt to detect validation weaknesses.

**Behavior:**

The agent should select a small portion of nodespec-related code and review it
for potential issues.

Possible actions include:

- Inspect a small section of nodespec logic.
- Check whether sourcing, curation, and generation validation are covered in
  their area-specific system tests.
- Attempt minor code modifications.
- Observe whether those modifications should logically cause a failure.
- Run the tests and check whether the failure is actually detected.

Specific things to look for:

- Logic that has been **accidentally stubbed out**
- Checks that appear to exist but **are not actually enforced**
- Conditions where validation appears to be happening but **the result is ignored**
- Absent coverage specs like that _all_ fixtures are covered or that _all_ pages have specs
- Type system being too lax and relying on other specs to catch errors
- Curation checks accidentally reading generation fields, or generation checks
  accidentally relying on curation validation to fail first

The key question is:

> Can the agent modify the nodespec logic in a way that should break the tests
but still allows them to pass?

---

## Task: `REMOVE_NODE_SPEC`

**Short description:**  
Remove a node specification entirely and verify that validation fails.

**Behavior:**

1. Pick a random page.
2. Remove its nodespec entirely.
3. Run the root-level checks.

If the tests still pass, this indicates that nodespecs are not being enforced
correctly.

---

## Task: `RENAME_NODE_SPEC_KEY`

**Short description:**  
Rename a key within a nodespec to test whether keys are strictly validated.

**Behavior:**

1. Select a nodespec.
2. Modify the name of one of its keys. Prefer changing one nested key inside
   `sourcing`, `curation`, or `generation` rather than only changing the top-level
   `bundle` key.
3. Run the root-level checks.

This tests whether nodespec keys are validated strictly or silently ignored.

---

## Task: `FLIP_BOOLEAN_VALUE`

**Short description:**  
Flip a boolean field in a nodespec to verify that mismatches are detected.

**Behavior:**

1. Pick a random page.
2. Select a boolean value in its `sourcing` section (`isInWorkingGraph` or
   `isInGraph`) or `curation` section (`isTracked` or a `filtersSelected` value).
3. Flip the value (`true → false` or `false → true`).
4. Run the root-level checks.

If validation is working properly, the tests should fail.

---

## Task: `MODIFY_NODE_SPEC_PATHS`

**Short description:**  
Modify path definitions inside a nodespec.

**Behavior:**

For a randomly selected page:

- Change one of the paths specified in the nodespec. Include both sourcing
  paths such as `sourcing.links.*.linkPath` and generation paths such as
  `generation.htmlRenderedLinks.*.relativeLinkPath` in the random selection.
- Remove an existing path
- Add an additional path

Choose randomly between any of the places where the paths are specified.

After making the change, run the root-level checks.

If tests still pass, this indicates that path validation is incomplete or missing.

---

## Task: `INTRA_NODESPEC_CONSISTENCY`

**Short description:**  
Within a single node's spec, look for inconsistencies

**Behavior:**

Compare the `sourcing` section and the `generation` section for one page. For
example, this was an issue we found at one point. One sourcing inlink was to the
"nested" one, but the generation backlink was to the "root" one:

```
    <snip>
    sourcing:
      links:
        outlinks: []
        inlinks:
          - linkPath: /t002/t002 ---- points to nested dup.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: t002 ---- points to root dup.html
    <snip>
```

Or this one where the inlink was completely absent from the footerSectionBacklinks

```
    <snip>
    sourcing:
      links:
        outlinks: []
        inlinks:
          - linkPath: /t018 - tags.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: ../_mw_gen/tagpages/tag--t018-unique-a.html
          - relativeLinkPath: ../_mw_gen/tagpages/tag--t018-unique-b.html
          - relativeLinkPath: ../_mw_gen/tagpages/tag--t018-unique-c.html
        footerSectionBacklinks: []
    <snip>
```

---

## Task: `ALIGNMENT_WITH_RENDERED_HTML`

**Short description:**  
Within a single node's generation spec, look at the associated rendered HTML

**Behavior:**

Look at the runtime/system_tests/expected_results/ folder for the associated HTML

Does the content of that HTML look like it aligns with the expectation set in
`generation.htmlRenderedLinks`?

For example, it is possible that the rendering skewed from the spec, even though parts of
the spec are intended to test the HTML rendering.

---

## Task: `AGENT_GETS_CREATIVE`

**Short description:**  
The agent tries to figure something out.

**Behavior:**

The agent tries to come up with some other bounded strategy to test on one or
more files.

---

# Test Execution Strategy

All modifications should be validated by running the **root-level check script**
rather than running targeted nodespec tests.

The reason for this is that one possible failure mode is that the nodespec
checks **are not properly included in the root-level check script**.

Running the root-level checks ensures we are testing the **same validation path
used during normal development workflows**.

When debugging a failure, targeted nodespec tests may be run first:

```bash
cd app/runtime/system_tests
npx vitest run tests/nodespecs_general.test.ts tests/areas/bundle/sourcing/nodespecs_sourcing.test.ts tests/areas/bundle/curation/nodespecs_curation.test.ts tests/areas/bundle/generation/nodespecs_generation.test.ts
```

The final validation for a run must still be the root-level check.

---

# Expected Outcome

The chaos testing loop should help identify situations where:

- nodespec validation is incomplete
- Validation logic has been disabled
- Certain fields are not actually being checked
- nodespec checks are not wired into the main test pipeline

Any scenario where tests **continue to pass despite clearly invalid nodespecs**
should be treated as a bug and investigated.

When an issue is discovered, the agent **may attempt to fix it**, provided the
fix is small, localized, and can be validated by rerunning the checks.

---

# Expected Output

Each run of this scenario performs **exactly one task** and then exits.

The agent must emit a structured report describing:

- what task was performed
- whether a validation issue was discovered
- whether a fix was attempted
- whether the fix was applied
- whether the fix was validated

The output must be **a single JSON object printed to standard output**.

This allows the external harness running the scenario repeatedly to:

- collect results
- aggregate findings
- quickly scan terminal output for discovered issues

---

# JSON Output Schema

```json
{
  "taskId": "STRING",
  "taskDescription": "STRING",
  "issueFound": true,
  "fixAttempted": true,
  "fixApplied": true,
  "fixValidated": true,
  "details": "STRING"
}
