/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingSourceProposal, proposalConfigurationDraft, pendingProposalRevalidation, sourceReviewConfigurationMerge, filters, filterSensitivity, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing global filter drafts preserve unrelated edits and resolve competing shared changes`);

const description = linkedScenarioDescription(conceptText`Stage global definitions, enablement, creation and default-filter deletion. After Later, accepted
curation independently changes another field and creates/deletes filters, then competes on one
definition. Resolve that conflict without replacing unrelated global edits or default metadata.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'fe6156b8-57d9-4872-81f7-a9ce26abbe8e' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
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
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  for (const name of ['Shared review', 'Independent review', 'Obsolete review']) await sourceCommand(() => create(name));
  const defaultId = globals().find(filter => filter.name === 'Daily Notes (Sensitive)')!.id;
  const original = fs.readFileSync(globalPath, 'utf8');
  await sourceCommand(() => sourcing.openByLink('sourcing-review'));
  await sourceCommand(() => checkpoint('accepted global filters are available to both editor modes'));

  // --- Test start ---
  await sourceCommand(() => panel.editCustomFilter('Shared review'));
  await sourceCommand(() => expect(page.getByRole('dialog', { name: 'Edit Custom Filter', exact: true })).toContainText('Applies to all bundles in sourcing and curation after this proposal is accepted'));
  await sourceCommand(() => panel.saveCustomFilterEdits({ note: 'Proposed shared definition' }));
  await sourceCommand(() => panel.editCustomFilter('Independent review'));
  await sourceCommand(() => panel.saveCustomFilterEdits({ enabled: false }));
  await sourceCommand(() => create('Created in proposal'));
  await sourceCommand(() => panel.deleteCustomFilter('Daily Notes (Sensitive)'));
  expect(fs.readFileSync(globalPath, 'utf8')).toBe(original);
  await sourceCommand(() => addKeyFrame(proposalConfigurationDraft));
  await sourceCommand(() => checkpoint('global definition enablement creation and default deletion remain isolated in the proposal'));
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => panel.editCustomFilter('Independent review'));
  await sourceCommand(() => panel.saveCustomFilterEdits({ note: 'Independent accepted description' }));
  await sourceCommand(() => panel.editCustomFilter('Shared review'));
  await sourceCommand(() => panel.saveCustomFilterEdits({ note: 'Competing accepted definition' }));
  await sourceCommand(() => create('Created in curation'));
  await sourceCommand(() => panel.deleteCustomFilter('Obsolete review'));
  // The kept proposal has no source changes, yet stays reachable from the toolbar.
  await sourceCommand(() => expect(page.getByTestId('sourcing-status').getByRole('button', { name: 'Changes pending – Review', exact: true })).toBeVisible());
  await sourceCommand(() => addKeyFrame(pendingSourceProposal));
  await sourceCommand(() => checkpoint('accepted curation has independent global changes and one competing definition'));

  // The field-level conflict names the shared definition while preserving compatible changes.
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.resolveConflicts(1));
  const dialog = page.getByRole('dialog', { name: 'Resolve configuration conflicts', exact: true });
  await sourceCommand(() => expect(dialog).toContainText('Shared review'));
  await sourceCommand(() => expect(dialog).toContainText('Competing accepted definition'));
  await sourceCommand(() => expect(dialog).toContainText('Proposed shared definition'));
  await sourceCommand(() => addKeyFrame(sourceReviewConfigurationMerge));
  await sourceCommand(() => checkpoint('the global definition conflict is open and unresolved'));
  await sourceCommand(() => dialog.getByRole('button', { name: 'Use proposed', exact: true }).click());
  await sourceCommand(() => expect(dialog).toContainText('All conflicts resolved.'));
  await sourceCommand(() => dialog.getByRole('button', { name: 'Close', exact: true }).click());
  await sourceCommand(() => sourcing.accept());
  expect(globals().find(filter => filter.name === 'Shared review')?.note).toBe('Proposed shared definition');
  expect(globals().find(filter => filter.name === 'Independent review')).toMatchObject({ note: 'Independent accepted description', enabled: false });
  for (const name of ['Created in proposal', 'Created in curation']) expect(globals().some(filter => filter.name === name)).toBe(true);
  for (const name of ['Obsolete review', 'Daily Notes (Sensitive)']) expect(globals().some(filter => filter.name === name)).toBe(false);
  const config = YAML.parse(fs.readFileSync(path.join(testServer.configDir, 'app/app_config.yaml'), 'utf8'));
  expect(config.deletedDefaultFilterIds).toContain(defaultId);
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => panel.expectFilterVisible('Created in proposal'));
  await sourceCommand(() => panel.expectFilterVisible('Created in curation'));
  await sourceCommand(() => expect(page.getByRole('checkbox', { name: /^Daily Notes/ })).toHaveCount(0));
  await sourceCommand(() => checkpoint('merged acceptance preserves both creations independent fields deletion and default metadata'));
  await sourceCommand(() => assertMeadowHomeState());
});
