/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { scenarioSections, bundleSource, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewWorkspace, sourceSetupEdit } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Multi-source disconnection preserves captured pages until the source is explicitly removed`);

const description = linkedScenarioDescription(conceptText`Make one registered source unavailable. Captured pages should remain usable until the
source is explicitly removed and the removal is accepted.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the accepted source state is established before changing files.` },
  disconnectReferenceSource: { type: 'test', text: conceptText`Disconnect the reference source.` },
  verifyCapturedPagesRemainAvailable: { type: 'test', text: conceptText`Verify the captured pages remain available.` },
  removeReferenceSource: { type: 'test', text: conceptText`Remove the reference source.` },
  cleanupExplainsWhyDisconnectedSourceSFiles: { type: 'test', text: conceptText`Cleanup explains why the disconnected source's files are preserved.` },
  laterRetainsProposedRegistryAcrossReloadsDirect: { type: 'test', text: conceptText`Later retains the proposed registry across reloads, with a direct route back to its review.` },
  cancelProposedRemovalWithoutAlteringSourceFiles: { type: 'test', text: conceptText`Cancel the proposed removal without altering the source files or accepted material.` },
  proposeRemovalAgain: { type: 'test', text: conceptText`Propose the removal again.` },
  acceptSourceUpdate: { type: 'test', text: conceptText`Accept the source update.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceSetupEdit, sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '5ac47ba7-f545-421b-8521-e3267e6d0380' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck, expectLogErrors }) => {
  const { editor, sources, bundleConfig, beforeNodes } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect);
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('multi-source-page'));
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForLoad('multi-source-page'));
    await sourceCommand(() => editor.waitForSourceCheck());
    const sources = new SourcesControl(page, expect);
    const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
    const beforeNodes = bundleConfig.readNodesText();
    await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));
    return { editor, sources, bundleConfig, beforeNodes };
  });

  await test.step(sections.steps.disconnectReferenceSource, async () => {
    await sourceCommand(() => sourceChanges.apply('disconnect-reference', 'multi-source'));
    await sourceCommand(() => sources.open());
    await sourceCommand(() => sources.expectDisconnected('source000003'));
    await sourceCommand(() => addKeyFrame(bundleSource));
    await sourceCommand(() => checkpoint('a disconnected source is identified without discarding its captured material'));
  });

  await test.step(sections.steps.verifyCapturedPagesRemainAvailable, async () => {
    await sourceCommand(() => sources.close());
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000003/Study.md', true));
    expect(bundleConfig.readNodesText()).toBe(beforeNodes);
    await sourceCommand(() => checkpoint('captured pages and configuration remain intact while the source is disconnected'));
  });

  const { registryChanges } = await test.step(sections.steps.removeReferenceSource, async () => {
    await sourceCommand(() => sources.open());
    await sourceCommand(() => sources.remove('source000003'));
    await sourceCommand(() => sources.stage());
    const registryChanges = page.getByRole('region', { name: 'Source registry changes', exact: true });
    await sourceCommand(() => expect(registryChanges).toContainText('Removed source reference'));
    await sourceCommand(() => expect(registryChanges.getByTestId('source-registry-change-source000001')).toHaveCount(0));
    await sourceCommand(() => expect(registryChanges.getByTestId('source-registry-change-source000002')).toHaveCount(0));
    expect(bundleConfig.read().sources?.map(source => source.id)).toContain('source000003');
    expect(bundleConfig.readNodesText()).toBe(beforeNodes);
    await sourceCommand(() => editor.sourceReview.orphans.expectOrphanListed('Study'));
    await sourceCommand(() => editor.sourceReview.orphans.expectOrphanListed('Appendix'));
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('review shows only the removed source and affected pages while accepted material stays intact'));
    return { registryChanges };
  });

  await test.step(sections.steps.cleanupExplainsWhyDisconnectedSourceSFiles, async () => {
    await sourceCommand(() => editor.sourceReview.orphans.showExplanation('Study'));
    await sourceCommand(() => editor.sourceReview.orphans.expectExplanation('Study', 'Its files are untouched.'));
    await sourceCommand(() => checkpoint('source removal cleans configuration at acceptance while retaining source files'));
  });

  const { pendingChanges } = await test.step(sections.steps.laterRetainsProposedRegistryAcrossReloadsDirect, async () => {
    await sourceCommand(() => editor.sourceReview.defer());
    await sourceCommand(() => page.reload());
    await sourceCommand(() => editor.waitForLoad('multi-source-page'));
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => sources.open());
    const manageSources = page.getByRole('dialog', { name: 'Manage sources', exact: true });
    const pendingChanges = manageSources.getByRole('button', { name: 'Changes awaiting review', exact: true });
    await sourceCommand(() => expect(pendingChanges).toBeEnabled());
    await sourceCommand(() => expect(manageSources.getByTestId('source-source000003')).toHaveCount(0));
    await sourceCommand(() => expect(manageSources.getByRole('textbox', { name: 'Source name notes', exact: true })).toHaveValue('notes'));
    await sourceCommand(() => expect(manageSources.getByRole('textbox', { name: 'Source name research', exact: true })).toHaveValue('research'));
    expect(bundleConfig.read().sources?.map(source => source.id)).toContain('source000003');
    expect(bundleConfig.readNodesText()).toBe(beforeNodes);
    await sourceCommand(() => addKeyFrame(bundleSource));
    await sourceCommand(() => checkpoint('Manage sources restores the pending removal after Later and reload while accepted material is retained'));
    await sourceCommand(() => pendingChanges.click());
    await sourceCommand(() => expect(manageSources).not.toBeVisible());
    await sourceCommand(() => expect(registryChanges).toContainText('Removed source reference'));
    await sourceCommand(() => editor.sourceReview.orphans.expectOrphanListed('Study'));
    await sourceCommand(() => editor.sourceReview.orphans.expectOrphanListed('Appendix'));
    expect(bundleConfig.readNodesText()).toBe(beforeNodes);
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('the pending changes indicator returns directly to the source and material review'));
    return { pendingChanges };
  });

  await test.step(sections.steps.cancelProposedRemovalWithoutAlteringSourceFiles, async () => {
    const endDisconnectedScan = expectLogErrors(/disconnected: its directory is unavailable|server responded with a status of 409/);
    await sourceCommand(() => editor.sourceReview.discard());
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => expect(page.getByTestId('sourcing-status').getByRole('alert')).toContainText('disconnected'));
    endDisconnectedScan();
    await sourceCommand(() => expect(page.getByTestId('sourcing-workspace')).not.toBeVisible());
    expect(bundleConfig.read().sources?.map(source => source.id)).toContain('source000003');
    expect(bundleConfig.readNodesText()).toBe(beforeNodes);
    expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'multi-source/reference-disconnected/Study.md'))).toBe(true);
    await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000003/Study.md', true));
    await sourceCommand(() => sources.open());
    await sourceCommand(() => sources.expectDisconnected('source000003'));
    await sourceCommand(() => expect(pendingChanges).toHaveCount(0));
    await sourceCommand(() => addKeyFrame(bundleSource));
    await sourceCommand(() => checkpoint('cancelling source removal retains the registry, captured pages, and source files'));
  });

  await test.step(sections.steps.proposeRemovalAgain, async () => {
    await sourceCommand(() => sources.remove('source000003'));
    await sourceCommand(() => sources.stage());
  });

  await test.step(sections.steps.acceptSourceUpdate, async () => {
    await sourceCommand(() => editor.sourceReview.accept());
    const config = bundleConfig.read();
    expect(config.sources?.map(source => source.id)).toEqual(['source000001', 'source000002']);
    expect(bundleConfig.readNodes().some(node => node.sourceId === 'source000003')).toBe(false);
    expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'multi-source/reference-disconnected/Study.md'))).toBe(true);
    await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000003/Study.md', false));
    await sourceCommand(() => checkpoint('acceptance removes the disconnected source and its orphaned configuration'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
