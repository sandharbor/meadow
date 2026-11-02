/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, ChangesTab, PreviewPublishModal } from '../src/run/pages/index.js';
import { scenarioSections, exemplarySpec, sourceSnapshot, sourceMove, bundleNodeId, sourceReviewAcceptance, changesTab as changesTabDoc, conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, bundleGeneration, bundleReview, sourceReviewIdentity, sourceReviewWorkspace } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

const slug = 'meadow-test-bundle-big';
const originalTitle = 't003 ---- page with section to link to';
const renamedTitle = 't003 ---- renamed section page';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`A confirmed source rename preserves page identity and appears once as Moved in the Changes Tab`);

const description = linkedScenarioDescription(conceptText`Save a generated baseline, then rename a source page and update its incoming link. Confirm the suggested ${conceptLink(sourceMove.id, 'Source Move')} in ${conceptLink(sourceReviewIdentity.id, 'Source Review Identity')}. ${conceptLink(sourceReviewAcceptance.id, 'Proposal Acceptance')} preserves the page's ${conceptLink(bundleNodeId.id, 'Bundle Node ID')} under its new name. After regeneration, the ${conceptLink(changesTabDoc.id, 'Changes Tab')} shows one Moved file with its old and new paths.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open the accepted ${conceptLink(sourceSnapshot.id, 'Source Snapshot')} and save a generated baseline for later comparison in the ${conceptLink(changesTabDoc.id, 'Changes Tab')}.` },
  renamePageLinks: { type: 'test', text: conceptText`Rename the page and update its incoming link. The proposed ${conceptLink(sourceMove.id, 'Source Move')} waits for review while the original page's saved configuration remains unchanged.` },
  confirmIdentity: { type: 'test', text: conceptText`Inspect the suggested ${conceptLink(sourceMove.id, 'Source Move')} and its captured evidence, then confirm Same file in ${conceptLink(sourceReviewIdentity.id, 'Source Review Identity')}.` },
  acceptSourceUpdate: { type: 'test', text: conceptText`Use ${conceptLink(sourceReviewAcceptance.id, 'Proposal Acceptance')} and verify that the same ${conceptLink(bundleNodeId.id, 'Bundle Node ID')} now carries the renamed title.` },
  regenerateReviewRenamedPageAgainstSavedSite: { type: 'test', text: conceptText`Regenerate and compare with the saved baseline in the ${conceptLink(changesTabDoc.id, 'Changes Tab')}. The renamed page appears once as Moved with its old and new paths.` },
});
const areas = scenarioAreas([bundleSourcing, bundleGeneration, bundleReview], { subAreas: [sourceReviewIdentity, sourceReviewWorkspace, changesTabDoc] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '86ec9574-29c5-4f44-b44e-58cfbbbae216' }, { type: 'concept', description: exemplarySpec.id }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor, bundleConfig, original, modal, changes } = await test.step(sections.steps.setup, async () => {
    const wf = new Workflows(page, expect);
    await sourceCommand(() => wf.navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, slug, expect);
    const original = bundleConfig.requireNode({ bundleNodeName: originalTitle });
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => editor.expectSourceOrphanCount(13));
    await sourceCommand(() => checkpoint(conceptText`The accepted ${conceptLink(sourceSnapshot.id, 'Source Snapshot')} contains the configured page before its source is renamed.`));

    // Save the generated site before renaming its source page.
    const modal = new PreviewPublishModal(page, expect);
    const changes = new ChangesTab(page, expect);
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => modal.waitForPreviewComplete());
    await sourceCommand(() => modal.expectUntrackedPagesWarning());
    await sourceCommand(() => modal.clickSaveChanges());
    await sourceCommand(() => modal.waitForSaveComplete());
    await sourceCommand(() => modal.closeModal());
    await sourceCommand(() => checkpoint(conceptText`A saved generation records the page at its original path for comparison in the ${conceptLink(changesTabDoc.id, 'Changes Tab')}.`));
    return { editor, bundleConfig, original, modal, changes };
  });

  await test.step(sections.steps.renamePageLinks, async () => {
    await sourceCommand(() => sourceChanges.apply('rename-page-with-links'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => expect(page.getByRole('button', { name: /source changes? available.*Review/i })).toBeVisible());
    await sourceCommand(() => editor.sourceReview.expectClosed());
    await sourceCommand(() => editor.expectSourceOrphanCount(13));
    expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toEqual(original);
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint(conceptText`The proposed ${conceptLink(sourceMove.id, 'Source Move')} awaits review; the original page's saved configuration and the existing orphan count are unchanged.`));
  });

  const { review } = await test.step(sections.steps.confirmIdentity, async () => {
    const review = editor.sourceReview;
    await sourceCommand(() => review.open());
    await sourceCommand(() => review.expectIdentityReviewRequired());
    await sourceCommand(() => review.expectMove('Renamed', `${originalTitle}.md`, `${renamedTitle}.md`));
    const rename = await sourceCommand(() => review.moveFrom(`${originalTitle}.md`));
    await sourceCommand(() => addKeyFrame(sourceMove));
    await sourceCommand(() => checkpoint(conceptText`${conceptLink(sourceReviewIdentity.id, 'Source Review Identity')} requires a decision and presents the suggested rename.`));
    await sourceCommand(() => review.confirmSuggestedIdentities());
    await sourceCommand(() => rename.expectSamePageSelected());
    await sourceCommand(() => rename.expectNoContentComparison());
    await sourceCommand(() => rename.expectSingleRoute(['main page.md', 't003 - link to section.md']));
    await sourceCommand(() => addKeyFrame(sourceMove));
    await sourceCommand(() => checkpoint(conceptText`Same file is confirmed in ${conceptLink(sourceReviewIdentity.id, 'Source Review Identity')}; its evidence shows the unchanged leading route and unchanged page content.`));
    return { review };
  });

  await test.step(sections.steps.acceptSourceUpdate, async () => {
    await sourceCommand(() => review.accept());
    await sourceCommand(() => expect.poll(() => bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })?.bundleNodeName).toBe(renamedTitle));
    await sourceCommand(() => editor.expectSourceOrphanCount(0));
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => expect(page.getByText(renamedTitle, { exact: true }).first()).toBeVisible());
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint(conceptText`${conceptLink(sourceReviewAcceptance.id, 'Proposal Acceptance')} retains the ${conceptLink(bundleNodeId.id, 'Bundle Node ID')} under the renamed title.`));
  });

  await test.step(sections.steps.regenerateReviewRenamedPageAgainstSavedSite, async () => {
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => modal.waitForPreviewComplete());
    await sourceCommand(() => modal.expectUntrackedPagesWarning());
    await sourceCommand(() => modal.clickChangesTab());
    await sourceCommand(() => changes.expectComparisonBaseline('Compared with the last saved generation of this version'));
    await sourceCommand(() => changes.expectNoIdentityNotice());
    await sourceCommand(() => changes.expectMovedFile(`${renamedTitle}.html`, { modified: true }));
    await sourceCommand(() => changes.expectMovedFileCount(1));
    await sourceCommand(() => changes.expectFileNotInChanges(`${originalTitle}.html`));
    await sourceCommand(() => changes.selectFile(`${renamedTitle}.html`));
    await sourceCommand(() => changes.expectSelectedFileMove(`${originalTitle}.html`, `${renamedTitle}.html`));
    await sourceCommand(() => addKeyFrame(changesTabDoc));
    await sourceCommand(() => checkpoint(conceptText`The ${conceptLink(changesTabDoc.id, 'Changes Tab')} shows the renamed page once as Moved with its old and new paths.`));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
