# E2E Specification Quality

Make a test understandable from its title, description, section prose, meaningful
steps, and checkpoints. Those elements should tell an accurate, cohesive story
without requiring the reader to decode the implementation.

For a review, the caller supplies the selected tests and whether to review or
apply edits. Accept any selected set; selection and batch size belong to the
invocation. When no edit mode is specified, review structure first and propose
copy once the structure is settled.

## Author at the level of intent

Read the skill's live `rule-reference.ts` output before implementation. It is the
source-owned reference for mechanically enforced requirements and their repair
examples; the checks distinguish quickcheck rules from the selected-spec
editorial audit. The guidance below adds judgment about specification quality.

Read `app/acceptance/e2e/_module/docs/coding_standards.md` for the executable
structure and `app/concepts/README.md` for typed metadata, concept links, and
report capture. Keep one test per file. Use existing `Workflows` for navigation
and page/component objects for UI actions and assertions. Keep selectors and
DOM structure in those reusable objects; a test-local helper that hides a raw
selector does not provide the intended abstraction. Compose meaningful actions
rather than spelling out each click in the spec.

Keep persisted-state questions at the same level of intent. Use the utility
responsible for bundle configuration, filters, accepted source state, or
generation records instead of constructing storage paths and parsing JSON/YAML
inside the scenario. A spec-local parsing helper does not establish the reusable
boundary. Preserve exact-byte snapshots and independent persistence evidence
where those are the claim. Quickcheck enforces this with `lint-no-raw-data.ts`.
For genuinely necessary raw access, follow the live `no-raw-data` rule's narrowly scoped
`e2e-allow-raw-data` comment with a specific reason; ordinary configuration
assertions should use the domain utility.

Use `linkedScenarioName`, `linkedScenarioDescription`, `scenarioAreas`, and
`scenarioSections`, preserving the stable scenario ID and captured annotations.
Only the first section may be setup. Execute each section through its named
`test.step`; return and destructure values needed later, retaining a shared
outer binding for state observed by callbacks. Keep implementation notes beside
the code they explain. Reuse canonical concepts rather than creating one per
control or scenario. Declare design-pressure associations explicitly.

Assert each meaningful phase's outcome and capture useful restorable checkpoints,
including the arranged starting state. Checkpoint prose describes the state
reached. Keyframes provide concept-linked visual evidence. Capture at least one
meaningful concept keyframe in each scenario, directly or
through a checkpoint, at a state that represents the demonstrated behavior.
Keep the final
`assertMeadowHomeState()` or `skipMeadowHomeStateCheck()` after the last checkpoint.
Choose checkpoint placement with judgment; a check after every click is not the
goal. The report captures prose with its run, so editing source does not rewrite
an older report.

## Fixture-first scenario design

Treat the shared MeadowHome fixtures and their source graphs as first-class QA
artifacts, not merely as setup data for automated tests. A durable product
scenario should usually be represented in:

- `app/shared_data/home_fixtures/` for bundle and application state.
- `app/shared_data/source_graphs/` for the source nodes and links that
  drive that state.

Prefer extending the most appropriate existing fixture and source graph over
constructing equivalent test-local data. The fixture should remain meaningful
and easy to inspect so the same scenario can drive both the development UI for
manual QA and the E2E suite for automated verification. Keep source-node
content, links, nodespec claims, and fixture configuration aligned.

Home fixtures are hand-authored saved states: quickcheck rejects anything but
authored configuration (no generated bundle data, Git metadata, local resources,
secrets, or logs). Use `home_fixture_minimal` for a home with configuration but
no bundles, and `fixtureHome: "empty"` for a fresh install whose home folder does
not exist. E2E and Dev Tools open fixtures through the same shared opener, and
every scenario's source graphs are isolated copies inside its home.

When changing a shared fixture, find every scenario that consumes it and update
exact counts, paths, node-spec expectations, and generated-output assertions as
needed. Add test-local setup only when the state is inherently ephemeral,
requires isolation or failure injection, or would make the reusable fixture
misleading; do not choose it merely because it is quicker for one test.

## App Places in scenarios

Every dialog is an App Place declared under `contracts/places`: an addressable
surface of the area that renders it, or a declared transient with a reason. A
checkpoint fails when an open dialog is neither, and names the dialog.

A scenario may open a place directly (`new AppPlace(page, expect).open(path)`)
only in its Setup phase; behavior under test stays click-driven. A full run
reports place coverage and fails when a surface is reached only by link or not
at all, so keep at least one scenario that clicks its way to every surface.
The `app-place-links-*` scenarios open every declared surface from a link;
add an example link in `app/acceptance/e2e/src/run/placeLinkCheck.ts` when declaring a surface.

## Read the story, then check the evidence

Read repository instructions and the project's test-authoring conventions.
First read each test's reader-facing narrative without its implementation and
identify the starting state, trigger, decision, and observable outcome. Then
read the executable test, relevant helpers, fixture changes, and linked specs
to determine what it actually proves. Record where the narrative alone leaves
the reader guessing, even if the code eventually explains it.

Use canonical domain definitions to check terminology. Documentation is evidence
of intended behavior; assertions are evidence of exercised behavior. If they
disagree, surface the conflict rather than choosing a convenient definition or
silently rewriting product policy. Read relevant helpers before declaring a
claim unsupported: they may contain the assertion.

## Editorial rubric

- **Title:** Name the behavior and its distinguishing outcome. Prefer a clear
  claim to a list of controls, implementation details, or every assertion.
- **Description:** Explain the necessary starting condition, consequential
  action or choice, and resulting behavior. Explain why unusual setup matters.
  Do not repeat the title, narrate every click, or promise untested branches.
- **Sections and steps:** Group a cohesive set of non-trivial actions around
  one intent and result. A useful section explains why its enclosed code belongs
  together. Merge procedural fragments that obscure one phase; split sections
  that hide distinct decisions or state transitions. Choose granularity from the
  story, without a target number of sections, lines, or checkpoints. Setup should
  establish relevant preconditions; a behavior under test should remain visible
  as such. Retain meaningful evidence when regrouping.
- **Checkpoints:** Describe the state reached and why it matters for inspection
  or continuation. Distinguish pending decisions from accepted effects. Match
  claims to the assertions and captured state at that moment; a screenshot or
  checkpoint label alone does not prove an invariant. Avoid action-only labels
  and generic statements such as “the starting state is established.”
- **Language and links:** Use consistent domain terms and useful, accurately
  labeled links to existing concepts or specification sections. Require at
  least one meaningful canonical concept link in the description and in every
  section, including setup. A missing link flags a review defect. Check that
  each linked concept explains the section's intent or relevant starting state;
  a decorative link does not satisfy this requirement. Use the connection to
  judge section granularity, without assuming one concept requires one section.
  Reuse existing concepts and do not invent one merely to satisfy the link rule.
  Use ubiquitous language consistently across the specification, scenarios,
  relevant implementation, and product wording. Prefer the canonical page name
  verbatim in prose and link labels wherever possible. Avoid aliases and
  competing labels; use a grammatical adjustment only when needed rather than
  casually substituting a friendlier phrase. Links reinforce the documented
  vocabulary and give readers its meaning. Do not dismiss a documented term as
  jargon merely because it is unfamiliar or does not appear on a UI control.
  Describe actions and outcomes in grammatical sentences around those names.
  If a canonical name is unclear, misleading, or inconsistent with the behavior
  and implementation, flag a domain-naming issue and propose a coordinated
  correction at its source. Do not solve it only with friendlier scenario prose
  or a parallel synonym hidden behind the original link. A genuine naming change
  needs to carry through the concept, definitions, relevant implementation names
  and roles, and affected documentation or UI, respecting their actual scopes.
  Link the ideas that explain the scenario, without turning every repeated word
  into a link.
  Keep reusable definitions in their canonical registry; keep scenario-specific
  facts beside the test. Preserve typed links and explicit coverage metadata.
- **Fixture details:** Describe roles and relationships, such as the original
  page, renamed page, and referring page. Include exact filenames, paths, IDs,
  or fixture labels in narrative only when their particular values distinguish
  the behavior being specified. Keep incidental concrete values in executable
  steps and diagnostics. A rename needs the fact that the name changes, not
  necessarily the fixture's literal old and new filenames.
- **Cohesion:** State the scenario's main question in one sentence. Keep related
  phases together when they establish one causal story, including across app
  areas. Group by the behavioral question, not by shared setup. Multiple claims
  may describe stages, consequences, or invariants of that same story; a
  separately meaningful behavior belongs in a focused scenario. Sharing an
  expensive setup does not justify combining unrelated specification concerns.
  Choose scenario boundaries for specification clarity and address execution
  cost separately. Flag independent questions, optional detours, or setup that dominates
  the result as split candidates. Explain what each resulting scenario would
  prove and what setup or coverage would need to move. Give each resulting
  scenario the smallest relevant starting state; do not copy unrelated setup
  mechanisms from the original test. For example, a selection interaction may
  use existing source-marked sensitivity without constructing a custom filter
  when filter-derived sensitivity is not the behavior being tested.
  Do not equate a long test
  or multiple checkpoints with poor cohesion.
- **Truthfulness:** Check each material claim against the assertions. Look for
  premature claims about accepted state, inferred negative assertions, ambiguous
  “it” or “them,” unexplained fixture names, and descriptions that claim both
  sides of a choice while executing only one. Narrow copy to the supported
  outcome or explicitly recommend stronger evidence; do not weaken assertions
  to make the prose fit.

## Claims and supporting evidence

Treat the scenario's behavioral claims explicitly. Reuse existing typed
behavioral rules for canonical meaning; keep the particular example and its
claim beside the test. Where the project supports typed claim declarations,
check stable claim identities and section/checkpoint references: every declared
claim needs supporting evidence, and every claim reference must resolve.
Types or static checks establish linkage, not the sufficiency of the evidence.
Review the linked assertions and state transitions to judge actual support.

Multiple claims are permitted and call for additional cohesion scrutiny. Ask
whether they form one causal story, whether each has sufficient evidence, and
whether independent concerns would be clearer as separate scenarios. Do not
impose a claim-count limit or split merely because there is more than one claim.
Do not introduce primary/secondary claim categories to accommodate unrelated
checks. Decide whether an extra assertion supports the scenario's question or
answers another behavioral question; for the latter, recommend separate coverage
at the appropriate test level rather than silently dropping the assertion.
For projects without claim declarations, include a proposed claim-to-evidence
mapping in the review. Recommend any schema work explicitly rather than
inventing unsupported APIs or adding infrastructure during a copy-edit pass.

## Preserve behavior during editorial edits

For copy edits, preserve executable actions, assertions, inputs, command order,
fixture setup, waits, and cleanup. Keep scenario identity and evidence metadata.
Section regrouping may change wrappers and value-transfer scaffolding; review
scope, callback, and execution-order effects carefully. Keep checkpoints and
keyframes associated with the state they capture. Do not change a string used
as a selector, input, or expected value as though it were narrative copy.

Scenario splits and assertion or behavioral changes are a distinct kind of
recommendation. Explain them concretely and apply them only when within the
caller's requested scope. Preserve the original coverage when restructuring.
An exemplary marker identifies a reference specimen, not proof it needs no
editing; do not add or remove those markers merely to match the selected set.
When the user requests marking completed reviews exemplary, add `exemplarySpec`
and its concept annotation as each test's agreed changes are finished. Preserve
an existing marker without duplication; do not mark unfinished candidates merely
because they were selected for review.

## Repository references and mechanical checks

The quality reference for exemplary specimens is `exemplarySpec` in
`app/concepts/development/concepts.ts`. Apply the rubric to the selected tests
without changing their exemplary markers to fit the selection. In sourcing,
distinguish live sources, the captured pending proposal, and accepted state.

Quickcheck already checks one test per file, required typed scenario metadata,
registered concepts and areas, explicit design-pressure associations, page-object
locator boundaries, fixture rules, and final home-state assertion placement.
Run the repository-required quickcheck after edits. Reuse those checks rather
than duplicating their implementations inside the skill.

For a dedicated editorial pass, run the additional selected-spec audit from the
repository root (pass any number of spec paths or directories):

```bash
NODE_OPTIONS="${NODE_OPTIONS:-} --preserve-symlinks" \
  app/acceptance/e2e/node_modules/.bin/tsx \
  app/acceptance/e2e/_module/scripts/lint-editorial-links.ts \
  app/acceptance/e2e/tests/sourcing-separate-files.spec.ts
```

Exit 0 means the mechanical audit passed, 1 reports defects, and 2 indicates an
invocation or read error. This audit checks captured metadata and requires a
canonical concept link in the description and every section, including setup.
It resolves imported aliases or literal concept IDs against the registry and
checks direct interpolations in typed prose. It does not execute authored code.
Opaque dynamic prose must be made explicit for this audit. Comments, Markdown
URLs, imports alone, keyframes, and links to other document kinds do not satisfy
the concept-link rule.

The audit is opt-in on the selected tests while the existing suite is reviewed;
its parser tests run in quickcheck. Do not claim suite-wide enforcement. Link
relevance, section granularity, evidence sufficiency, and scenario cohesion are
agent judgments. Typed claim metadata and claim-reference validation remain
proposals until the repository implements that schema; produce claim-to-evidence
mappings in the review in the meantime.

## Deliver and refine

For each selected test, first state its main behavioral question and a structural
verdict: keep the existing structure, or recommend a specific change. Explain
cohesion findings with source locations and evidence. If recommending a split or
material regrouping, propose the resulting scenarios or section outline and what
each would prove. Settle that proposal with the user before drafting replacement
copy. Respect structure already agreed in the conversation; do not ask again.

If keeping the existing structure, or once a changed structure is agreed,
provide a complete proposed reader-facing narrative in the same response:
write the full title, full description, and full text of every section in order,
including setup and any text that stays unchanged. Do not substitute “keep,”
“add a link,” “clarify,” truncated fixture names, or other editing instructions
for actual replacement wording. Include complete replacement wording for any
checkpoint you propose changing. Preserve meaningful concept links in the
written draft; when reading it aloud, read their labels naturally. Present the
complete narrative after the structural verdict and before discussing individual
copy edits, so the user can judge the wording directly. Separate editorial changes
from coverage gaps, documentation conflicts, and split recommendations. Say
when existing copy should stay. Avoid numerical scores without useful criteria.
Apply the same evidence standard to proposed copy: label wording that depends
on stronger assertions as conditional, and do not replace an identified overclaim
with a new unsupported claim. Absence from a filtered view alone does not prove
why an item is absent; direct assertions of absence can still prove removal.

In apply mode, review the diff for behavior preservation and run repository-
required checks. Run affected E2E validation for executable regrouping or
restructuring, using the project's runner. Report exactly what ran and what
remains unverified. If a report is regenerated, inspect the reader-facing view.

When an external reviewing agent is requested, give it this skill and the
selected raw tests and relevant project references. Keep the pilot selection
outside this skill and avoid preloading the reviewer with the expected findings.
Verify its actual output against the code and canonical definitions. Attribute
external findings accurately; preparation or a failed launch is not a completed
external review. Refine the rubric from concrete review failures and user
feedback, rather than adding rules for every stylistic preference.
