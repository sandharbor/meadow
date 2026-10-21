/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import path from 'path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage, BundleListPage, ChangesTab, PreviewPublishModal } from '../src/run/pages/index.js';
import { acceptSourceBaseline } from '../../../shared_code/shared_dev/sourceScenario.js';
import type { GenerateBundleCliResult } from '../../../contracts/types/shared/cli/cliOperations.js';
import { scenarioSections, generationRecord, conceptLink, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundles, bundleGeneration, bundleReview } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

const slug = 'meadow-test-bundle-big';
const renamedSlug = 'meadow-test-bundle-big-renamed';

const name = linkedScenarioName(conceptText`Bundle rename regenerates with the same generation record contract as preview`);

const description = linkedScenarioDescription(conceptText`Save a generation and rename the unpublished bundle. The rename's regeneration should capture
the accepted inputs and a matching ${conceptLink(generationRecord.id, "generation record")} with page ownership, so Review compares it by identity without
a metadata notice.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: an unpublished bundle has a saved generation.` },
  renameBundleWhichRegeneratesCurrentVersion: { type: 'test', text: conceptText`Rename the bundle, which regenerates its current version.` },
  reviewComparesRenamedResultByRecordedIdentity: { type: 'test', text: conceptText`Review compares the renamed result by recorded identity.` },
});
const areas = scenarioAreas([bundles, bundleGeneration, bundleReview]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '9f9993e2-874a-47bc-bfd6-2d1cff3578ec' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, meadowCli, testServer, checkpoint, skipMeadowHomeStateCheck }) => {
  const { generated } = await test.step(sections.steps.setup, async () => {
    let command = 0;
    const run = (args: string[]) => meadowCli.run(args, { artifactName: `setup-${++command}` });
    await sourceCommand(() => acceptSourceBaseline(run, slug));
    const generated = await sourceCommand(() => meadowCli.runJson<GenerateBundleCliResult>(['bundle', 'generate', slug], { artifactName: 'generate' }));
    await sourceCommand(() => run(['bundle', 'save-generation', slug, '--version', generated.versionId]));
    const plan = await sourceCommand(() => meadowCli.runJson<{ providers: unknown[] }>(['bundles', 'rename-plan', slug], { artifactName: 'rename-plan' }));
    expect(plan.providers).toEqual([]);
    await sourceCommand(() => checkpoint('an unpublished bundle has a saved generation'));
    return { generated };
  });

  await test.step(sections.steps.renameBundleWhichRegeneratesCurrentVersion, async () => {
    await sourceCommand(() => meadowCli.runJson(['bundles', 'rename', slug, '--to', renamedSlug], { artifactName: 'rename' }));
    const records = path.join(testServer.configDir, 'bundles', renamedSlug, 'raw', 'generation_inputs');
    const inputs = JSON.parse(fs.readFileSync(path.join(records, `${generated.versionId}.json`), 'utf8'));
    const output = JSON.parse(fs.readFileSync(path.join(records, `${generated.versionId}.output.json`), 'utf8'));
    const accepted = JSON.parse(fs.readFileSync(path.join(testServer.configDir, 'bundles', renamedSlug, 'raw', 'sourcing', 'state.json'), 'utf8'));
    expect(inputs).toMatchObject({ schemaVersion: 2, sourceSnapshotId: accepted.acceptedId, generationId: output.generationId });
    expect(output.output.owners.some((owner: { role: string }) => owner.role === 'page')).toBe(true);
    expect(output.includedSources.length).toBeGreaterThan(0);
    await sourceCommand(() => checkpoint('the renamed bundle has a complete generation record'));
  });

  await test.step(sections.steps.reviewComparesRenamedResultByRecordedIdentity, async () => {
    const bundleList = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => bundleList.goto());
    await sourceCommand(() => bundleList.clickBundle(renamedSlug));
    await sourceCommand(() => editor.waitForLoad(renamedSlug));
    const modal = new PreviewPublishModal(page, expect);
    const changes = new ChangesTab(page, expect);
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => modal.waitForPreviewComplete());
    await sourceCommand(() => modal.expectUntrackedPagesWarning());
    await sourceCommand(() => modal.clickChangesTab());
    await sourceCommand(() => changes.expectComparisonBaseline('Compared with the last saved generation of this version'));
    await sourceCommand(() => changes.expectNoIdentityNotice());
    await sourceCommand(() => checkpoint('review compares the renamed bundle without a metadata notice'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
