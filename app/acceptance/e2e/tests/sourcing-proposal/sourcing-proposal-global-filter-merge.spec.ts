/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, proposalConfigurationDraft, pendingProposalRevalidation, sourceReviewConfigurationMerge, filters, filterSensitivity } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Stage global definitions, enablement, creation and default-filter deletion. After Later, accepted
 * curation independently changes another field and creates/deletes filters, then competes on one
 * definition. Resolve that conflict without replacing unrelated global edits or default metadata.
 */
test('Sourcing global filter drafts preserve unrelated edits and resolve competing shared changes', async ({ page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const panel = new FilterPanelComponent(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const globalPath = path.join(testServer.configDir, 'app/global_custom_filters.json');
  const globals = () => JSON.parse(fs.readFileSync(globalPath, 'utf8')).filters as { id: string; name: string; note?: string; enabled: boolean }[];
  const create = async (name: string) => {
    await panel.clickAddCustomFilter();
    await panel.fillAndSaveCustomFilter({ name, field: 'title', matchType: 'substring', value: 'Reference', scope: 'global' });
  };
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  for (const name of ['Shared review', 'Independent review', 'Obsolete review']) await create(name);
  const defaultId = globals().find(filter => filter.name === 'Daily Notes (Sensitive)')!.id;
  const original = fs.readFileSync(globalPath, 'utf8');
  await checkpoint('accepted global filters are available to both editor modes');

  // --- Test start ---
  await sourcing.open();
  await panel.editCustomFilter('Shared review');
  await expect(page.getByRole('dialog', { name: 'Edit Custom Filter', exact: true })).toContainText('Applies to all bundles in sourcing and curation after this proposal is accepted');
  await panel.saveCustomFilterEdits({ note: 'Proposed shared definition' });
  await panel.editCustomFilter('Independent review');
  await panel.saveCustomFilterEdits({ enabled: false });
  await create('Created in proposal');
  await panel.deleteCustomFilter('Daily Notes (Sensitive)');
  expect(fs.readFileSync(globalPath, 'utf8')).toBe(original);
  await addKeyFrame(proposalConfigurationDraft);
  await checkpoint('global definition enablement creation and default deletion remain isolated in the proposal');
  await sourcing.later();
  await panel.editCustomFilter('Independent review');
  await panel.saveCustomFilterEdits({ note: 'Independent accepted description' });
  await panel.editCustomFilter('Shared review');
  await panel.saveCustomFilterEdits({ note: 'Competing accepted definition' });
  await create('Created in curation');
  await panel.deleteCustomFilter('Obsolete review');
  await checkpoint('accepted curation has independent global changes and one competing definition');

  // The field-level conflict names the shared definition while preserving compatible changes.
  await sourcing.open();
  await sourcing.root.getByRole('button', { name: 'Resolve 1 configuration conflicts', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Resolve configuration conflicts', exact: true });
  await expect(dialog).toContainText('Shared review');
  await expect(dialog).toContainText('Competing accepted definition');
  await expect(dialog).toContainText('Proposed shared definition');
  await addKeyFrame(sourceReviewConfigurationMerge);
  await checkpoint('the global definition conflict is open and unresolved');
  await dialog.getByRole('button', { name: 'Use proposed', exact: true }).click();
  await expect(dialog).toContainText('All conflicts resolved.');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await sourcing.accept();
  expect(globals().find(filter => filter.name === 'Shared review')?.note).toBe('Proposed shared definition');
  expect(globals().find(filter => filter.name === 'Independent review')).toMatchObject({ note: 'Independent accepted description', enabled: false });
  for (const name of ['Created in proposal', 'Created in curation']) expect(globals().some(filter => filter.name === name)).toBe(true);
  for (const name of ['Obsolete review', 'Daily Notes (Sensitive)']) expect(globals().some(filter => filter.name === name)).toBe(false);
  const config = YAML.parse(fs.readFileSync(path.join(testServer.configDir, 'app/app_config.yaml'), 'utf8'));
  expect(config.deletedDefaultFilterIds).toContain(defaultId);
  await page.reload();
  await editor.waitForLoad('sourcing-review');
  await panel.expectFilterVisible('Created in proposal');
  await panel.expectFilterVisible('Created in curation');
  await expect(page.getByRole('checkbox', { name: /^Daily Notes/ })).toHaveCount(0);
  await checkpoint('merged acceptance preserves both creations independent fields deletion and default metadata');
  await assertMeadowHomeState();
});
