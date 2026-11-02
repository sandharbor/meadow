---
name: e2e
description: Write, review, run, and repair Meadow E2E specifications. Use for scenario authoring, editorial and structural reviews, claim-to-evidence analysis, page-object abstraction, and E2E validation.
---

# Meadow E2E Specifications

Use this skill for E2E authoring, review, and execution.
Choose the work from the request; a review-only task does not require a suite run.
The caller supplies test selection and batch size.
An `/e2e` invocation without an authoring or review request uses run mode.

## Write or change a scenario

Before implementing, read the live enforced-rule reference from the repository root:

```bash
NODE_OPTIONS="${NODE_OPTIONS:-} --preserve-symlinks" \
  app/acceptance/e2e/node_modules/.bin/tsx \
  app/acceptance/e2e/_module/scripts/rule-reference.ts
```

Use `--list` for rule IDs or pass IDs for focused lookup. The TypeScript rule
definitions supply both this reference and lint failure guidance. Quickcheck
runs their displayed valid and invalid examples through the real validators and
checks that every lint is documented and registered at its stated enforcement
level. This is a live view, with no generated document to refresh.

Read [Specification quality](references/spec-quality.md), including the linked
coding standards and canonical concept-authoring conventions. Design from the
appropriate shared fixture, write intent-level sections using workflows and page
objects, and make the title, description, sections, and checkpoints tell an
accurate causal story. Keep storage paths, raw file access, and JSON/YAML parsing
in reusable domain utilities or page classes; use the documented, reasoned
`e2e-allow-raw-data` exception only when raw access is essential to the claim.
Apply the same editorial rubric used in review.

Run the selected-spec concept-link audit, then required quickcheck. For new
scenarios, scenario splits, or executable changes, follow
[Running and diagnosing](references/running.md) for E2E validation. Preserve
coverage when splitting and surface the affected scenarios' review artifacts.

## Review or copy edit selected scenarios

Read [Specification quality](references/spec-quality.md). Run the mechanical
audit on the selected files, then review narrative, concept-link relevance,
claim-to-evidence support, section granularity, and cohesion. Allow multiple
claims with closer cohesion scrutiny. Give a structural verdict first. If keeping
the structure, provide full replacement copy; if recommending a split or material
regrouping, settle that proposal with the user before drafting copy. Honor any
structure already agreed. Include a claim-to-evidence mapping and distinguish
behavior-preserving edits from coverage
or restructuring recommendations. In review-only mode, leave the tests unchanged.

When an external editor is requested, give it this skill, the quality reference,
and raw selected tests and relevant canonical definitions. Verify its actual
findings against assertions and helpers. Use concrete examples and user feedback
to refine the shared rubric. Keep pilot selection outside the skill.

## Run or repair the suite

Read [Running and diagnosing](references/running.md) and follow its runner,
artifact, and failure-repair guidance. Apply the quality reference to test changes
made during repairs. Use the caller's runner when one is already established.
Follow the enclosing checkout's required validation instructions after changes.
