/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, ChangesTab, PreviewPublishModal } from '../src/run/pages/index.js';
import { scenarioSections, sourcingReviewRedesign, sourceSnapshot, sourceMove, sourceChange, changesTab as changesTabDoc, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, bundleGeneration, bundleReview, sourceReviewIdentity, sourceReviewWorkspace } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

const slug = 'meadow-test-bundle-big';
const originalTitle = 't003 ---- page with section to link to';
const renamedTitle = 't003 ---- renamed section page';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`A source page rename preserves identity and appears as a moved file in Review`);

const description = linkedScenarioDescription(conceptText`Save a generated baseline, rename a source page and update its incoming link, then accept
the rename in Sourcing. Curation settings and page identity should survive acceptance. After regeneration,
Review should show one moved file with its old and new paths rather than a separate deletion and addition.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the accepted source state is established before changing files.` },
  renamePageLinks: { type: 'test', text: conceptText`Rename the page and its links.` },
  openSourceReview: { type: 'test', text: conceptText`Open source review.` },
  inspectUnchangedTraversalRoute: { type: 'test', text: conceptText`Inspect the unchanged traversal route.` },
  reopenReviewInspectLinkEdit: { type: 'test', text: conceptText`Reopen review and inspect the link edit.` },
  acceptSourceUpdate: { type: 'test', text: conceptText`Accept the source update.` },
  regenerateReviewRenamedPageAgainstSavedSite: { type: 'test', text: conceptText`Regenerate and review the renamed page against the saved site.` },
});
const areas = scenarioAreas([bundleSourcing, bundleGeneration, bundleReview], { subAreas: [sourceReviewIdentity, sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '86ec9574-29c5-4f44-b44e-58cfbbbae216' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor, bundleConfig, original, modal, changes } = await test.step(sections.steps.setup, async () => {
    const wf = new Workflows(page, expect);
    await sourceCommand(() => wf.navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, slug, expect);
    const original = bundleConfig.requireNode({ bundleNodeName: originalTitle });
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => editor.expectSourceOrphanCount(13));
    await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

    // Save the generated site before renaming its source page.
    const modal = new PreviewPublishModal(page, expect);
    const changes = new ChangesTab(page, expect);
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => modal.waitForPreviewComplete());
    await sourceCommand(() => modal.expectUntrackedPagesWarning());
    await sourceCommand(() => modal.clickSaveChanges());
    await sourceCommand(() => modal.waitForSaveComplete());
    await sourceCommand(() => modal.closeModal());
    await sourceCommand(() => checkpoint('a saved generation records the page at its original path'));
    return { editor, bundleConfig, original, modal, changes };
  });

  await test.step(sections.steps.renamePageLinks, async () => {
    await sourceCommand(() => sourceChanges.apply('rename-page-with-links'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => expect(page.getByRole('button', { name: /source changes? available.*Review/i })).toBeVisible());
    await sourceCommand(() => editor.sourceReview.expectClosed());
    await sourceCommand(() => editor.expectSourceOrphanCount(13));
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('candidate waits while accepted curation remains stable'));
  });

  const { review, rename } = await test.step(sections.steps.openSourceReview, async () => {
    const review = editor.sourceReview;
    await sourceCommand(() => review.open());
    await sourceCommand(() => review.expectIdentityReviewRequired());
    await sourceCommand(() => review.expectMove('Renamed', `${originalTitle}.md`, `${renamedTitle}.md`));
    const rename = await sourceCommand(() => review.moveFrom(`${originalTitle}.md`));
    await sourceCommand(() => addKeyFrame(sourceMove));
    await sourceCommand(() => checkpoint('proposed rename opens required identity review with the rename suggested'));
    return { review, rename };
  });

  await test.step(sections.steps.inspectUnchangedTraversalRoute, async () => {
    await sourceCommand(() => review.confirmSuggestedIdentities());
    await sourceCommand(() => rename.expectSamePageSelected());
    await sourceCommand(() => rename.expectNoContentComparison());
    await sourceCommand(() => rename.expectSingleRoute(['main page.md', 't003 - link to section.md']));
    await sourceCommand(() => addKeyFrame(sourceMove));
    await sourceCommand(() => checkpoint('an unchanged traversal route uses file pills without repeating the renamed endpoint'));
  });

  await test.step(sections.steps.reopenReviewInspectLinkEdit, async () => {
    await sourceCommand(() => review.defer());
    await sourceCommand(() => review.open());
    await sourceCommand(() => review.expandDetails('t003 - link to section.md'));
    await sourceCommand(() => review.expectInlineChanges('t003 - link to section.md', ['page with section to link to'], ['renamed section page']));
    await sourceCommand(() => addKeyFrame(sourceChange));
    await sourceCommand(() => checkpoint('renamed link text uses readable replacement phrases'));
  });

  await test.step(sections.steps.acceptSourceUpdate, async () => {
    await sourceCommand(() => review.accept());
    await sourceCommand(() => expect.poll(() => bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })?.bundleNodeName).toBe(renamedTitle));
    await sourceCommand(() => editor.expectSourceOrphanCount(0));
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => expect(page.getByText(renamedTitle, { exact: true }).first()).toBeVisible());
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('accepted rename keeps the existing tracked page identity'));
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
    await sourceCommand(() => checkpoint('Review shows the renamed page once as Moved with its old and new paths'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
