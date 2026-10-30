/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, ChangesTab, PreviewPublishModal, PublishToS3Tab, PublishedBundlePage } from '../src/run/pages/index.js';
import { GeneratedBundleVersions, MeadowHomeBundleConfig } from '../src/run/utils/index.js';
import { scenarioSections, sourceMove, versioning, publicationRevision, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, bundleGeneration, bundleReview, bundleSharing, sourceReviewIdentity } from '../../../concepts/index.js';

const slug = 'meadow-test-bundle-big';
const publishSlug = 'source-page-rename';
const originalTitle = 't003 ---- page with section to link to';
const renamedTitle = 't003 ---- renamed section page';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`A published page leads readers to its renamed page after Sourcing acceptance and connected version publication`);

const description = linkedScenarioDescription(conceptText`Publish a page, rename its source and update its incoming link, then accept the rename
as the same page in Sourcing. Create and publish a connected generated version while retaining the earlier files.
The old published page should keep its original content and offer a link that opens the renamed page.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the original page is saved and published at its original path.` },
  renameSourcePageReviewIdentity: { type: 'test', text: conceptText`Rename the source page and review its identity.` },
  acceptRenameWhilePreservingPageIdentity: { type: 'test', text: conceptText`Accept the rename while preserving the page identity.` },
  createGeneratedVersionContainingRenamedPage: { type: 'test', text: conceptText`Create a generated version containing the renamed page.` },
  saveMovedOutputPublishConnectedRevision: { type: 'test', text: conceptText`Save the moved output and publish a connected revision.` },
  visitOldPageInspectLinkRenamedCounterpart: { type: 'test', text: conceptText`Visit the old page and inspect its link to the renamed counterpart.` },
  followReaderSLinkRenamedPage: { type: 'test', text: conceptText`Follow the reader's link to the renamed page.` },
});
const areas = scenarioAreas([bundleSourcing, bundleGeneration, bundleReview, bundleSharing], { subAreas: [sourceReviewIdentity, publicationRevision] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '2632e392-a3dd-44cc-a0d3-4f3f520ac54f' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, testServer, minioS3, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor, bundleConfig, original, modal, versions, initialVersion, publish, originalUrl, originalPageKey, originalHtml } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => testServer.activateS3Provider());
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForSourceCheck());
    const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, slug, expect);
    const original = bundleConfig.requireNode({ bundleNodeName: originalTitle });
    const modal = new PreviewPublishModal(page, expect);
    const versions = new GeneratedBundleVersions(page, expect, slug);
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => modal.waitForPreviewComplete());
    await sourceCommand(() => modal.expectUntrackedPagesWarning());
    await sourceCommand(() => modal.clickSaveChanges());
    await sourceCommand(() => modal.waitForSaveComplete());
    const initialVersion = await sourceCommand(() => versions.waitForOnlyVersion());
    await sourceCommand(() => modal.clickShareTab());
    const publish = new PublishToS3Tab(page, expect);
    await sourceCommand(() => publish.expectVisible());
    await sourceCommand(() => publish.setPublishSlug(publishSlug));
    await sourceCommand(() => publish.clickPublish());
    const originalUrl = await sourceCommand(() => publish.expectPublishSuccess());
    const originalNamespace = `${publishSlug}-${initialVersion.versionId}`;
    const originalPageKey = `${originalNamespace}/${originalTitle}.html`;
    const originalHtml = await sourceCommand(() => minioS3.getObjectContent(originalPageKey));
    expect(originalHtml).toContain(`<h1>${originalTitle}</h1>`);
    await sourceCommand(() => checkpoint('the original page is saved and published at its original path'));
    return { editor, bundleConfig, original, modal, versions, initialVersion, publish, originalUrl, originalPageKey, originalHtml };
  });

  const { review } = await test.step(sections.steps.renameSourcePageReviewIdentity, async () => {
    await sourceCommand(() => modal.closeModal());
    await sourceCommand(() => sourceChanges.apply('rename-page-with-links'));
    await sourceCommand(() => editor.checkSourceChanges());
    const review = editor.sourceReview;
    await sourceCommand(() => review.open());
    await sourceCommand(() => review.expectIdentityReviewRequired());
    await sourceCommand(() => review.expectMove('Renamed', `${originalTitle}.md`, `${renamedTitle}.md`));
    await sourceCommand(() => review.confirmSuggestedIdentities());
    const rename = await sourceCommand(() => review.moveFrom(`${originalTitle}.md`));
    await sourceCommand(() => rename.expectSamePageSelected());
    await sourceCommand(() => addKeyFrame(sourceMove));
    await sourceCommand(() => checkpoint('Sourcing identifies the renamed file as the already published page'));
    return { review };
  });

  await test.step(sections.steps.acceptRenameWhilePreservingPageIdentity, async () => {
    await sourceCommand(() => review.accept());
    await sourceCommand(() => expect.poll(() => bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })?.bundleNodeName).toBe(renamedTitle));
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => expect(page.getByText(renamedTitle, { exact: true }).first()).toBeVisible());
    await sourceCommand(() => checkpoint('the accepted rename retains the original page identity'));
  });

  const { successor } = await test.step(sections.steps.createGeneratedVersionContainingRenamedPage, async () => {
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => modal.waitForPreviewComplete());
    await sourceCommand(() => modal.expectUntrackedPagesWarning());
    await sourceCommand(() => modal.openCreateNewVersionDialog());
    await sourceCommand(() => modal.createConnectedVersion('Renamed the published section page'));
    const [predecessor, successor] = await sourceCommand(() => versions.waitForCount(2));
    expect(predecessor).toMatchObject({ versionId: initialVersion.versionId, displayState: 'frozen' });
    expect(successor.displayState).toBe('unsaved');
    await sourceCommand(() => addKeyFrame(versioning));
    await sourceCommand(() => checkpoint('the new generated version preserves its frozen predecessor'));
    return { successor };
  });

  const { successorUrl } = await test.step(sections.steps.saveMovedOutputPublishConnectedRevision, async () => {
    const changes = new ChangesTab(page, expect);
    await sourceCommand(() => modal.clickChangesTab());
    await sourceCommand(() => changes.expectComparisonBaseline('Compared with the saved generation of the previous version'));
    await sourceCommand(() => changes.expectMovedFile(`${renamedTitle}.html`, { modified: true }));
    await sourceCommand(() => changes.selectFile(`${renamedTitle}.html`));
    await sourceCommand(() => changes.expectSelectedFileMove(`${originalTitle}.html`, `${renamedTitle}.html`));
    await sourceCommand(() => modal.clickSaveChanges());
    await sourceCommand(() => modal.waitForSaveComplete());
    await sourceCommand(() => modal.clickShareTab());
    await sourceCommand(() => modal.selectShareVersion(successor.versionId));
    await sourceCommand(() => publish.clickPublish());
    await sourceCommand(() => publish.confirmConnectedRevisionKeepingEarlierFiles());
    const successorUrl = await sourceCommand(() => publish.expectPublishSuccess());
    const successorNamespace = `${publishSlug}-${successor.versionId}`;
    const successorKeys = await sourceCommand(() => minioS3.listKeys(`${successorNamespace}/`));
    expect(successorKeys).toContain(`${successorNamespace}/${renamedTitle}.html`);
    expect(successorKeys).not.toContain(`${successorNamespace}/${originalTitle}.html`);
    expect(await sourceCommand(() => minioS3.getObjectContent(originalPageKey))).toBe(originalHtml);
    await sourceCommand(() => checkpoint('the connected publication contains the renamed page and retains the unchanged old page'));
    return { successorUrl };
  });

  const { newPageUrl, reader } = await test.step(sections.steps.visitOldPageInspectLinkRenamedCounterpart, async () => {
    const oldPageUrl = new URL(`${originalTitle}.html`, originalUrl).toString();
    const newPageUrl = new URL(`${renamedTitle}.html`, successorUrl).toString();
    const reader = new PublishedBundlePage(page, expect);
    await sourceCommand(() => reader.goto(oldPageUrl));
    await sourceCommand(() => reader.expectMainHeadingVisible(originalTitle));
    await sourceCommand(() => reader.expectNewerPageLink(newPageUrl));
    await sourceCommand(() => addKeyFrame(publicationRevision));
    await sourceCommand(() => checkpoint('the old published page links directly to the renamed page in the newer version'));
    return { newPageUrl, reader };
  });

  await test.step(sections.steps.followReaderSLinkRenamedPage, async () => {
    await sourceCommand(() => reader.openNewerVersion());
    await sourceCommand(() => expect(page).toHaveURL(newPageUrl));
    await sourceCommand(() => reader.expectMainHeadingVisible(renamedTitle));
    await sourceCommand(() => reader.expectNoNewerVersionNotice());
    await sourceCommand(() => addKeyFrame(publicationRevision));
    await sourceCommand(() => checkpoint('the reader reaches the renamed page through the old publication'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
