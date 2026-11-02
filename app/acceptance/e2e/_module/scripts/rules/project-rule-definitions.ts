/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import type { LintRuleGuidance } from '../lint-rule.js';

export const homeFixturesRule: LintRuleGuidance = {
  id: 'home-fixtures', title: 'Keep home fixtures authored',
  script: '_module/scripts/lint-home-fixtures.ts', enforcement: 'quickcheck',
  why: 'Home fixtures are reusable saved states shared by E2E and manual QA. Generated data and machine-local state make that starting point misleading or unsafe to copy.',
  requirements: [
    'Allowed files are fixture.yaml, app/app_config.yaml, app/hooks/*.ts|js|mjs, and bundles/<slug>/config/{bundle_config.yaml,bundle_node_config.yaml,custom_filters.json,generated_bundle_versions.yaml}.',
    'Generated data, Git metadata, local resources, credentials, logs, and symlinks belong to an opened home. The checker ignores .DS_Store.',
    'fixture.yaml is a mapping with only an optional sourceGraphs list of source graph names.',
    'Examples list regular-file paths relative to home_fixture_example. The example checker creates that exact temporary tree with empty authored files and sourceGraphs: [] in fixture.yaml, then calls homeFixtureViolations. Content checks beyond fixture.yaml belong to the owning configuration validators.',
  ],
  repair: 'Remove runtime and generated state from the fixture. Keep supported authored bundle configuration under config/ and source nodes in shared_data/source_graphs. Correct invalid fixture metadata rather than opting out.',
  examples: [
    { name: 'Authored application and bundle configuration', expected: 'pass', code: `fixture.yaml
app/app_config.yaml
app/hooks/page-title.ts
bundles/demo/config/bundle_config.yaml
bundles/demo/config/bundle_node_config.yaml
bundles/demo/config/custom_filters.json
bundles/demo/config/generated_bundle_versions.yaml` },
    { name: 'Generated data and machine-local files are not fixture inputs', expected: 'fail', code: `app/app_config.yaml
app/resources.local.yaml
bundles/demo/raw/generation_inputs/Entry.md
logs/meadow.log
.git/HEAD` },
  ],
};

export const sourceChangeCoverageRule: LintRuleGuidance = {
  id: 'source-change-coverage', title: 'Give each shared source change one owning scenario',
  script: '_module/scripts/lint-source-change-coverage.ts', enforcement: 'quickcheck',
  why: 'Dev Tools and acceptance scenarios expose the same authored source changes. Every change needs a focused, discoverable scenario that actually applies it.',
  requirements: [
    'Each shared source change names its own E2E spec basename; two changes cannot share an owner.',
    'Exactly one discovered scenario must have that basename and call sourceChanges.apply with the change ID and graph. An omitted graph means meadow-test-bundles-data.',
    'Every fixture menu exposing changes refers to those checked owners, including fixtures sharing source graphs.',
    'Examples are ownership inputs: parsed change definitions, filenames with exact TypeScript scenario source, and fixture menus. They exercise the CLI ownership validator. The real project scan first loads change.yaml and fixtures through their existing strict parsers.',
  ],
  repair: 'Assign a distinct spec to each change and make that owner apply the exact change/graph. Resolve duplicate or missing spec basenames. Other scenarios may reuse a change as setup without becoming its owner.',
  examples: [
    { name: 'One owner applies the shared change', expected: 'pass', code: `{
  "changes": [{ "sourceGraph": "notes", "id": "rename-page", "e2e": "rename-page.spec.ts" }],
  "scenarios": [{ "filename": "tests/rename-page.spec.ts", "source": "await sourceChanges.apply('rename-page', 'notes');" }],
  "fixtures": [{ "name": "home_fixture_review", "changes": [{ "sourceGraph": "notes", "id": "rename-page", "e2e": "rename-page.spec.ts" }] }]
}` },
    { name: 'The owner must apply its declared change', expected: 'fail', code: `{
  "changes": [{ "sourceGraph": "notes", "id": "rename-page", "e2e": "rename-page.spec.ts" }],
  "scenarios": [{ "filename": "tests/rename-page.spec.ts", "source": "await sourceChanges.apply('different-change', 'notes');" }],
  "fixtures": []
}` },
    { name: 'Two changes cannot share an owner', expected: 'fail', code: `{
  "changes": [
    { "sourceGraph": "notes", "id": "rename-page", "e2e": "changes.spec.ts" },
    { "sourceGraph": "notes", "id": "remove-page", "e2e": "changes.spec.ts" }
  ],
  "scenarios": [{ "filename": "tests/changes.spec.ts", "source": "await sourceChanges.apply('rename-page', 'notes'); await sourceChanges.apply('remove-page', 'notes');" }],
  "fixtures": []
}` },
    { name: 'A fixture menu cannot expose an unchecked owner', expected: 'fail', code: `{
  "changes": [], "scenarios": [],
  "fixtures": [{ "name": "home_fixture_review", "changes": [{ "sourceGraph": "notes", "id": "rename-page", "e2e": "rename-page.spec.ts" }] }]
}` },
  ],
};

export const conceptsRule: LintRuleGuidance = {
  id: 'concepts', title: 'Use a valid canonical document registry',
  script: '_module/scripts/lint-concepts.ts', enforcement: 'quickcheck',
  why: 'Typed documents supply shared names, relationships, and report navigation. Broken identity, links, ownership, or hierarchy make those references unreliable.',
  requirements: [
    'Use stable unique IDs and unambiguous names/aliases, supported schemas, nonempty text, and the sections required by each document kind.',
    'Document links, parents, and app-area references resolve. App-area memberships name actual app areas.',
    'UI sub-areas have one owning app area. Workflow sub-areas are contained within one owning area, with valid order and an acyclic parent hierarchy within that owner.',
    'Examples are single concept literals added to the real registry. They use the real conceptText/conceptLink builders and validateConceptRegistry plus validateDocuments, as loadDocumentRegistry does. This example scope covers schema/link/ownership checks, not compile-time participation or editorial quality.',
  ],
  repair: 'Correct the owning definition under app/concepts rather than adding parallel prose. Fix identity and unresolved links at their source, assign sub-areas to their actual owner, and repair invalid hierarchy.',
  examples: [
    { name: 'A UI sub-area has one actual owner', expected: 'pass', code: `({
  id: 'example-review-panel', name: 'Example Review Panel', kind: 'ui-sub-area',
  appAreaIds: ['bundle/review'],
  definition: conceptText\`A panel for inspecting a saved generation.\`,
  mechanics: [conceptText\`It presents evidence for the selected generation.\`],
  interplay: conceptText\`It belongs to \${conceptLink('bundle/review', 'Bundle Review')}.\`,
})` },
    { name: 'A UI sub-area cannot omit its owner', expected: 'fail', code: `({
  id: 'example-review-panel', name: 'Example Review Panel', kind: 'ui-sub-area',
  appAreaIds: [],
  definition: conceptText\`A panel for inspecting a saved generation.\`,
  mechanics: [conceptText\`It presents evidence for the selected generation.\`],
  interplay: conceptText\`It belongs to \${conceptLink('bundle/review', 'Bundle Review')}.\`,
})` },
    { name: 'Canonical links must name a registered document', expected: 'fail', code: `({
  id: 'example-review-panel', name: 'Example Review Panel', kind: 'ui-sub-area',
  appAreaIds: ['bundle/review'],
  definition: conceptText\`A panel for inspecting a saved generation.\`,
  mechanics: [conceptText\`It presents evidence for the selected generation.\`],
  interplay: conceptText\`It depends on \${conceptLink('missing-document', 'Missing Document')}.\`,
})` },
  ],
};

export const projectRuleGuidance = [homeFixturesRule, sourceChangeCoverageRule, conceptsRule] as const;
