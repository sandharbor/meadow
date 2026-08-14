# Chaos Testing Scenario: app area partitioning check

## Core Principle

A central concern in this testing scenario is **avoiding situations where tests
pass when they should fail**.

The goal of this approach is to deliberately introduce inconsistencies into this
part of the system and verify that the test suite **detects those
inconsistencies and fails appropriately**.

If a modification that should invalidate a specification still results in
the tests passing, that indicates a flaw in the validation or test coverage.

---

# Background

We have partitioned the app code, in both the `frontend` and `backend` into
"areas" as well as a small set of "shared" code.

The areas are:

areas/bundles           - the bundle listing page that comes up when you boot the app
areas/bundle/curation   - the bundle editing page.  Filters, selection, tracking, blacklisting
areas/bundle/generation - actually generating the files for the website.  Includes customization options.
areas/bundle/review     - browsing the preview bundle or looking at the page changes in the diff viewer
areas/bundle/sharing    - publishing or downloading the artifacts to you local computer
shared                - the code that doesn't nicely fit in a single area.  Should be minimal

These areas are intended to be silo'd from each other.  For example no "area"
should import another area's code directly.  They are, however, allowed to
import from "shared" code.

The partitioning is enforced by the lint rule specified in
`app/shared_code/check_support/check_area_boundaries.js`

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
Inspect the `app/shared_code/check_support/check_area_boundaries.js` file and the
linter that calls it.  

**Behavior:**

Does it look like it aligns with our goal, as stated above?

---

## Task: `ATTEMPT_CROSS_AREA_IMPORT`

**Short description:**  
Do a cross area import to see if the linter catches the problem

**Behavior:**

1. Pick a random area.
2. Find some "shared" code it uses.
3. Move that code into another "area" and update the imports

If the tests still pass, this indicates that linting rule is not correct or is
not being enforced correctly.

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
rather than running targeted tests.

The reason for this is that one possible failure mode is that the linting check
**are not properly included in the root-level check script**.

Running the root-level checks ensures we are testing the **same validation path
used during normal development workflows**.

---

# Expected Outcome

The chaos testing loop should help identify situations where:

Any scenario where tests **continue to pass despite clearly invalid area patterns**
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