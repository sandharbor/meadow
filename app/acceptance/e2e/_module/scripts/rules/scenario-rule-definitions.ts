/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import type { LintRuleGuidance } from '../lint-rule.js';

const metadataExample = `import { conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioAreas, scenarioSections, bundleSourcing, sourceSnapshot } from '../../../../concepts/index.js';
const name = linkedScenarioName(conceptText\`Accept a source snapshot\`);
const description = linkedScenarioDescription(conceptText\`Accept the \${conceptLink(sourceSnapshot.id, 'Source Snapshot')}.\`);
const areas = scenarioAreas([bundleSourcing]);
const sections = scenarioSections({
  accept: { type: 'test', text: conceptText\`Accept the candidate \${conceptLink(sourceSnapshot.id, 'snapshot')}.\` },
});
test(name.name, { annotation: [name.annotation, description.annotation, areas.annotation, sections.annotation] }, async () => {});`;

export const singleTestPerSpecGuidance: LintRuleGuidance = {
  id: 'single-test-per-spec', title: 'One scenario with captured typed metadata',
  script: '_module/scripts/lint-single-test-per-spec.ts', enforcement: 'quickcheck',
  why: 'The report presents a whole spec as one scenario. Its title, description, areas, and optional metadata must describe that scenario and survive run capture.',
  requirements: [
    'Define exactly one recognized inline test, test.only, test.skip, or test.fixme scenario per .spec.ts file.',
    'Declare const name = linkedScenarioName(conceptText`…`) before const description = linkedScenarioDescription(conceptText`…`), using imported concept helpers and nonempty typed text.',
    'Declare const areas = scenarioAreas([...]) with literal lists of imported app areas and optional subAreas; use name.name as the title and capture name.annotation, description.annotation, and areas.annotation in the test metadata.',
    'When sections is declared, capture sections.annotation. This rule does not require a sections declaration or prove that named sections execute.',
    'When pressures is declared or scenarioDesignPressures is imported, declare a literal list of imported design pressures and capture pressures.annotation. Registry checks reject unknown or duplicate pressures, duplicate areas, invalid app areas, and sub-areas outside the declared areas.',
  ],
  repair: 'Split multiple scenarios into separate specs. Keep shared setup in reusable modules. Add the typed declarations and their annotations, and choose report areas whose behavior the scenario exercises; concept links do not declare areas.',
  examples: [
    { name: 'One scenario and captured metadata', code: metadataExample, expected: 'pass' },
    { name: 'Areas declaration omitted from captured annotations', code: metadataExample.replace('areas.annotation, ', ''), expected: 'fail' },
    { name: 'Sections are optional for this metadata rule', code: metadataExample.replace(/const sections = scenarioSections\(\{[\s\S]*?\}\);\n/, '').replace(', sections.annotation', ''), expected: 'pass' },
    { name: 'Declared sections must be captured', code: metadataExample.replace(', sections.annotation', ''), expected: 'fail' },
    { name: 'Non-area concept used as an app area', code: metadataExample.replace('scenarioAreas([bundleSourcing])', 'scenarioAreas([sourceSnapshot])'), expected: 'fail' },
    { name: 'Duplicate app areas', code: metadataExample.replace('scenarioAreas([bundleSourcing])', 'scenarioAreas([bundleSourcing, bundleSourcing])'), expected: 'fail' },
    { name: 'Two scenarios in one file', code: metadataExample + '\ntest(name.name, { annotation: [name.annotation, description.annotation, areas.annotation, sections.annotation] }, async () => {});', expected: 'fail' },
  ],
};

export const bundleModeGuidance: LintRuleGuidance = {
  id: 'bundle-mode', title: 'Declare the scenario starting selection shape',
  script: '_module/scripts/lint-bundle-mode.ts', enforcement: 'quickcheck',
  why: 'A declared bundle mode classifies the scenario starting selection in the report and selects the matching fixture.',
  requirements: ['Include exactly one standalone test.use({ bundleMode: "…" }); declaration in each spec.', 'Supported values are single-file, single-folder, multiple-folders, and mixed-starts. The source matcher expects the standalone declaration with only bundleMode, including its trailing semicolon.'],
  repair: 'Add or correct the standalone declaration for the starting selection the scenario uses. Keep other fixture options in separate declarations.',
  examples: [
    { name: 'Standalone supported mode', code: "test.use({ bundleMode: 'single-file' });", expected: 'pass' },
    { name: 'Unsupported mode', code: "test.use({ bundleMode: 'unknown' });", expected: 'fail' },
    { name: 'Combined options are not the required standalone declaration', code: "test.use({ bundleMode: 'single-file', other: true });", expected: 'fail' },
  ],
};

export const noDirectLocatorsGuidance: LintRuleGuidance = {
  id: 'no-direct-locators', title: 'Keep direct locators in page and component objects',
  script: '_module/scripts/lint-no-direct-locators.ts', enforcement: 'quickcheck',
  why: 'Scenario code should express user-visible behavior. Selector details couple scenarios to DOM construction and obscure the behavior under review.',
  requirements: ['Do not call a property named .locator() anywhere in a scenario spec, including spec-local helpers.', 'This checker detects direct property .locator() calls; it does not audit every Playwright selector API or prove that every action uses a page object.'],
  repair: 'Move selector knowledge into the responsible reusable page or component object under src/run/pages and expose an action or assertion named for its purpose.',
  examples: [
    { name: 'Intent-level assertion excerpt', code: 'await generatedBundle.search.expectTitleResults(expectedTitles);', expected: 'pass' },
    { name: 'Direct locator excerpt', code: "await page.locator('[data-testid=title]').count();", expected: 'fail' },
  ],
};

export const noRawDataGuidance: LintRuleGuidance = {
  id: 'no-raw-data', title: 'Keep raw storage operations behind domain utilities',
  script: '_module/scripts/lint-no-raw-data.ts', enforcement: 'quickcheck',
  why: 'File I/O and JSON/YAML parsing expose storage details in a behavioral scenario. Intent-level utilities keep the claim readable and reusable.',
  requirements: ['Use domain utilities for normal setup and assertions instead of direct filesystem reads/writes, JSON.parse, or recognized YAML parser calls.', 'If raw bytes are essential to the claim, place e2e-allow-raw-data: with a specific reason of at least 15 characters immediately before the smallest statement or explicit block that needs it. Unused or misplaced exceptions fail.', 'The checker recognizes specific raw I/O and parser APIs, including supported aliases; JSON.stringify diagnostics are allowed. It is not a general data-flow proof or a ban on path strings.'],
  repair: 'Move ordinary serialization and filesystem knowledge to the responsible utility or page object under src/run. For recovery or corruption scenarios, explain the essential raw operation in a narrowly scoped exception.',
  examples: [
    { name: 'Domain assertion excerpt', code: "expect(bundleConfig.nodeNamed('Bridge').outlinksDepth).toBe(0);", expected: 'pass' },
    { name: 'Raw parsing excerpt', code: "const config = JSON.parse(contents);", expected: 'fail' },
    { name: 'Essential raw input with reason', code: '// e2e-allow-raw-data: Invalid JSON bytes are the essential input to this recovery test.\nJSON.parse(invalidBytes);', expected: 'pass' },
  ],
};

export const checkpointKeyFramesGuidance: LintRuleGuidance = {
  id: 'checkpoint-keyframes', title: 'Attach adjacent keyframes to their checkpoint',
  script: '_module/scripts/lint-checkpoint-keyframes.ts', enforcement: 'quickcheck',
  why: 'A keyframe immediately before a checkpoint captures the same state but leaves the image detached from the checkpoint in the report.',
  requirements: ['Merge every consecutive addKeyFrame() immediately preceding checkpoint() into that checkpoint’s keyFrames option, preserving concept order.', 'The source audit follows recognized aliases and supported sourceCommand wrappers within statement sequences. An intervening action, assertion, or control-flow statement separates captures.'],
  repair: 'Replace the adjacent standalone captures with checkpoint(text, { keyFrames: [firstConcept, secondConcept] }). Keep standalone captures when intervening work makes them a distinct moment.',
  examples: [
    { name: 'Merged captures excerpt', code: "await sourceCommand(() => checkpoint('Terms reordered.', { keyFrames: [filterMixing, otherConcept] }));", expected: 'pass' },
    { name: 'Multiple detached captures excerpt', code: "await addKeyFrame(filterMixing);\nawait addKeyFrame(otherConcept);\nawait checkpoint('Terms reordered.');", expected: 'fail' },
  ],
};

export const finalAssertionGuidance: LintRuleGuidance = {
  id: 'final-assertion', title: 'Declare the final MeadowHome state after the last checkpoint',
  script: '_module/scripts/lint-final-assertion.ts', enforcement: 'quickcheck',
  why: 'Every scenario must explicitly check or deliberately opt out of checking its final MeadowHome state, after the behavior shown in its last checkpoint.',
  requirements: ['Call assertMeadowHomeState() or skipMeadowHomeStateCheck() after the last checkpoint(); one call is still required when there are no checkpoints.', 'Use an inspectable inline block callback in test(name, callback) or test(name, metadata, callback); test.only, test.skip, and test.fixme variants are supported. Unsupported authored callback structures produce findings.', 'The checker compares direct call names in lexical source order within the callback. It does not prove runtime reachability, control flow, or aliased fixture behavior.'],
  repair: 'Destructure the intended fixture and call it after the final checkpoint. Prefer assertMeadowHomeState(); its allowedUntracked and allowedModified options accept exact relative paths for intentionally dirty files. Use skipMeadowHomeStateCheck() for a deliberate opt-out.',
  examples: [
    { name: 'Metadata signature with final assertion', code: "test(name.name, { annotation: [] }, async ({ checkpoint, assertMeadowHomeState }) => {\n  await checkpoint('Done.');\n  await assertMeadowHomeState();\n});", expected: 'pass' },
    { name: 'Classic signature with deliberate opt-out', code: "test('Scenario', async ({ skipMeadowHomeStateCheck }) => {\n  await skipMeadowHomeStateCheck();\n});", expected: 'pass' },
    { name: 'Assertion before final checkpoint', code: "test('Scenario', async ({ checkpoint, assertMeadowHomeState }) => {\n  await assertMeadowHomeState();\n  await checkpoint('Done.');\n});", expected: 'fail' },
    { name: 'Missing final assertion', code: "test('Scenario', async ({ checkpoint }) => { await checkpoint('Done.'); });", expected: 'fail' },
  ],
};

export const editorialLinksGuidance: LintRuleGuidance = {
  id: 'editorial-links', title: 'Link the scenario description and every section to concepts',
  script: '_module/scripts/lint-editorial-links.ts', enforcement: 'selected-spec',
  why: 'Concept links explain the meaning of the UI and behavior to the person reviewing the scenario. Each narrative section needs its own useful context.',
  requirements: ['This opt-in selected-spec audit checks captured scenario metadata plus concept-link presence in the description and every declared section, including setup sections. It is not currently a whole-suite quickcheck rule.', 'Declare a nonempty literal scenarioSections object. Each section text and the linkedScenarioDescription text must interpolate an imported conceptLink or documentLink with a known concept ID and a nonempty literal label.', 'Imports, comments, keyframes, design-pressure links, Markdown links, and links only in another section do not satisfy a prose link. Relevance, factual evidence, and narrative cohesion still require human review.'],
  repair: 'Run this checker with the selected spec paths. Add a relevant canonical concept link to each description and section, retaining the captured typed metadata. Review the prose and behavioral evidence after the presence check passes.',
  examples: [
    { name: 'Captured linked description and section', code: metadataExample, expected: 'pass' },
    { name: 'A section without its own concept link', code: metadataExample.replace("Accept the candidate \${conceptLink(sourceSnapshot.id, 'snapshot')}.", 'Accept the candidate snapshot.'), expected: 'fail' },
  ],
};

export const scenarioRuleGuidance: readonly LintRuleGuidance[] = [
  singleTestPerSpecGuidance, bundleModeGuidance, noDirectLocatorsGuidance,
  noRawDataGuidance, checkpointKeyFramesGuidance, finalAssertionGuidance, editorialLinksGuidance,
];
