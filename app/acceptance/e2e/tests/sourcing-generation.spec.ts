/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { AcceptedSourcingState, GenerationRecords } from '../src/run/utils/index.js';
import { fileURLToPath } from 'node:url';
import { getNodespecBlock, getNodespecForBundle } from '../../../runtime/system_tests/nodespecs/index.js';
import { extractMainSectionLinkPaths, extractFooterBacklinkPaths } from '../../../runtime/system_tests/helpers/htmlLinkExtractor.js';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage, PreviewPublishModal } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { scenarioSections, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, bundleGeneration, sourceReviewWorkspace } from '../../../concepts/index.js';

const slug = 'meadow-test-bundle-big';
const originalTitle = 't003 ---- page with section to link to';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing keeps generated material stable until a full-page source replacement is accepted`);

const description = linkedScenarioDescription(conceptText`Replace a source page while a saved generation exists. Generated material should remain
unchanged until the source replacement is accepted and regenerated.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the accepted source state is established before changing files.` },
  replaceSourcePage: { type: 'test', text: conceptText`Replace the source page.` },
  reopeningPreviewExercisesPublicGenerationPathChanged: { type: 'test', text: conceptText`Reopening preview exercises the public generation path with changed live bytes.` },
  acceptUpdateRegenerate: { type: 'test', text: conceptText`Accept the update and regenerate.` },
  acceptRegenerate: { type: 'test', text: conceptText`Accept and regenerate.` },
  completeReplacementPageCarriesOrdinaryUnconditionalNodeSpec: { type: 'test', text: conceptText`The complete replacement page carries an ordinary, unconditional NodeSpec.` },
});
const areas = scenarioAreas([bundleSourcing, bundleGeneration], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '7fcae7e6-194d-4a16-99bd-326d24679ee5' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor, previewModal, before } = await test.step(sections.steps.setup, async () => {
    const wf = new Workflows(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const previewModal = new PreviewPublishModal(page, expect);
    await sourceCommand(() => wf.navigateToBigBundlePreview());

    const before = new AcceptedSourcingState(testServer.configDir, "meadow-test-bundle-big").retainedPageText(`${originalTitle}.md`);
    await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));
    return { editor, previewModal, before };
  });

  await test.step(sections.steps.replaceSourcePage, async () => {
    await sourceCommand(() => sourceChanges.apply('replace-section-page'));
  });

  await test.step(sections.steps.reopeningPreviewExercisesPublicGenerationPathChanged, async () => {
    await sourceCommand(() => previewModal.closeModal());
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => previewModal.waitForPreviewComplete());
    await sourceCommand(() => previewModal.expectUntrackedPagesWarning());
    expect(new AcceptedSourcingState(testServer.configDir, "meadow-test-bundle-big").retainedPageText(`${originalTitle}.md`)).toBe(before);
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('generation continues using the accepted checkpoint while live source differs'));
  });

  await test.step(sections.steps.acceptUpdateRegenerate, async () => {
    await sourceCommand(() => previewModal.closeModal());
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => editor.sourceReview.open());
    await sourceCommand(() => checkpoint('the replacement is ready for source review'));
  });

  await test.step(sections.steps.acceptRegenerate, async () => {
    await sourceCommand(() => editor.sourceReview.accept());
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => previewModal.waitForPreviewComplete());
    await sourceCommand(() => previewModal.expectUntrackedPagesWarning());
    expect(new AcceptedSourcingState(testServer.configDir, "meadow-test-bundle-big").retainedPageText(`${originalTitle}.md`)).not.toBe(before);

    const record = new GenerationRecords(testServer.configDir, slug).onlyInputs();
    const accepted = new AcceptedSourcingState(testServer.configDir, "meadow-test-bundle-big").current;
    expect(record.sourceSnapshotId).toBe(accepted.acceptedId);
  });

  await test.step(sections.steps.completeReplacementPageCarriesOrdinaryUnconditionalNodeSpec, async () => {
    const replacement = fileURLToPath(new URL('../../../shared_data/source_changes/meadow-test-bundles-data/replace-section-page/replacement.md', import.meta.url));
    const nodeSpec = getNodespecForBundle(getNodespecBlock(replacement).block!, slug)!;
    const graphResponse = await sourceCommand(() => page.request.get(`/api/bundles/${slug}/curation/working-graph`));
    expect(graphResponse.ok()).toBe(true);
    const graph = await sourceCommand(() => graphResponse.json());
    const node = graph.nodes.find((item: { bundleNodeName: string }) => item.bundleNodeName === originalTitle);
    expect(Boolean(node)).toBe(nodeSpec.sourcing.isInWorkingGraph);
    expect(node.tracked).toBe(nodeSpec.curation.isTracked);

    const html = new GenerationRecords(testServer.configDir, slug).onlyVersionPageText(`${originalTitle}.html`);
    expect(extractMainSectionLinkPaths(html).sort()).toEqual(nodeSpec.generation.htmlRenderedLinks.mainSectionLinks.map(link => link.relativeLinkPath).sort());
    expect(extractFooterBacklinkPaths(html).sort()).toEqual(nodeSpec.generation.htmlRenderedLinks.footerSectionBacklinks.map(link => link.relativeLinkPath).sort());
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('generation adopts replaced source only after checkpoint acceptance'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
