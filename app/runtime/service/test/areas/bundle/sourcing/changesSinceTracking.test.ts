/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { describeSensitivityCause } from '../../../../src/shared/bundle-boundary-review/bundleBoundaryReviewService.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializeSourcing, loadSourcingState } from '../../../../src/shared/source-snapshot/sourceSnapshots.js';
import { loadTrackingRecords } from '../../../../src/shared/bundle-node/trackingRecords.js';
import { saveGlobalCustomFilters } from '../../../../../../shared_code/utils/globalCustomFiltersUtils.js';
import { reviewSourceProposal } from '../../../../src/areas/bundle/sourcing/services/proposalReview.js';
import { sourceProposalComparison } from '../../../../src/areas/bundle/sourcing/services/proposalComparison.js';
import { chooseProposalTracking } from '../../../../src/areas/bundle/sourcing/services/proposalDecisions.js';
import { discardSourceProposal, rebaseProposalSensitivityPolicy } from '../../../../src/areas/bundle/sourcing/services/proposalStore.js';
import { acceptSourceProposal } from '../../../../src/areas/bundle/sourcing/services/proposalAcceptance.js';
import { updateSourceProposalCapture } from '../../../../src/areas/bundle/sourcing/services/proposalCapture.js';
import type { CustomFilterConfig } from '../../../../../../contracts/types/shared/curation/customFilters.js';

vi.mock('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js', async original => ({
  ...await original<typeof import('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js')>(), commitChangesNative: vi.fn(async () => undefined),
}));
let home: string, directory: string, prior: string | undefined;
const filter: CustomFilterConfig = { id: 'private', name: 'Private material', scope: 'global', enabled: true,
  selectors: [{ field: 'title', matchType: 'substring', value: 'Start' }], selectorApplicationCriteria: 'union',
  actions: [{ type: 'mark_sensitive' }], createdAt: '2026-10-01', updatedAt: '2026-10-01' };
beforeEach(async () => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-tracking-change-')));
  prior = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = home;
  directory = path.join(home, 'bundles/review');
  fs.mkdirSync(path.join(directory, 'config'), { recursive: true });
  const source = path.join(home, 'sources');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'Start.md'), 'The public source entry.\n\n[[Child]]');
  fs.writeFileSync(path.join(source, 'Child.md'), 'A child whose sensitivity is independent.\n\n[[Leaf]]');
  fs.writeFileSync(path.join(source, 'Leaf.md'), 'A page reached only through Child.');
  fs.writeFileSync(path.join(directory, 'config/bundle_config.yaml'), YAML.stringify({ sourceDirectory: source,
    entryBundleNodeId: 'start0000001', defaultTraversalBundleNodeId: 'start0000001', defaultOutlinksDepth: 2 }));
  fs.writeFileSync(path.join(directory, 'config/bundle_node_config.yaml'), YAML.stringify({ nodes: [
    { bundleNodeId: 'start0000001', bundleNodeName: 'Start', bundleNodeKind: 'file', fileType: 'md', listType: 'whitelist' },
    { bundleNodeId: 'child0000001', bundleNodeName: 'Child', bundleNodeKind: 'file', fileType: 'md', listType: 'whitelist' },
    { bundleNodeId: 'leaf00000001', bundleNodeName: 'Leaf', bundleNodeKind: 'file', fileType: 'md', listType: 'whitelist' },
  ] }));
  await initializeSourcing(directory);
});
afterEach(() => {
  if (prior === undefined) delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  else process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = prior;
  fs.rmSync(home, { recursive: true, force: true });
});

it('surfaces previously accepted tracking and preserves current policy through discard and explicit review', async () => {
  const acceptedId = loadSourcingState(directory)!.acceptedId;
  saveGlobalCustomFilters(home, { filters: [filter], version: '1.0.0' });
  let review = await reviewSourceProposal(directory);
  expect(review.proposal.tracking['file:Start.md']).toMatchObject({ track: true, sensitivityChange: true, needsConfirmation: true });
  expect(review.proposal.tracking['file:Child.md']).toBeUndefined();
  expect(review.trackingTargets['file:Start.md'].untrackableReason).toBeTruthy();
  const compared = await sourceProposalComparison(directory);
  expect(compared.graph.nodes.find(node => node.bundleNodeName === 'Start')?.sourceReview?.modification).toMatchObject({ source: false, sensitivity: true });
  await discardSourceProposal(directory, review.proposal.revision);
  review = await reviewSourceProposal(directory);
  expect(review.candidate.id).toBe(acceptedId);
  expect(review.proposal.tracking['file:Start.md'].needsConfirmation).toBe(true);
  await chooseProposalTracking(directory, review.proposal.revision, ['file:Start.md'], true, true);
  review = await reviewSourceProposal(directory);
  await acceptSourceProposal(directory, review.reviewToken);
  expect(loadTrackingRecords(directory).start0000001.sensitivity).toMatchObject({ effectivelySensitive: true, reviewedAt: expect.any(String) });
  expect((await reviewSourceProposal(directory)).proposal.tracking['file:Start.md']).toBeUndefined();
});

it('removes a synthetic review choice when its saved cause disappears, without fetching live changes', async () => {
  saveGlobalCustomFilters(home, { filters: [filter], version: '1.0.0' });
  let review = await reviewSourceProposal(directory);
  const captured = review.candidate.id;
  fs.appendFileSync(path.join(home, 'sources/Child.md'), '\nUnrelated newer material.');
  saveGlobalCustomFilters(home, { filters: [{ ...filter, enabled: false }], version: '1.0.0' });
  await rebaseProposalSensitivityPolicy(directory, review.proposal.revision);
  review = await reviewSourceProposal(directory);
  expect(review.proposal.tracking).toEqual({});
  expect(review.candidate.id).toBe(captured);
  expect(review.proposal.original.globalFilters).toEqual(review.proposal.proposed.globalFilters);
  expect(review.configuration.globalFilters[0].enabled).toBe(false);
});

it('describes only established policy events and uses current matches for unknown history', () => {
  expect(describeSensitivityCause(filter)).toBe('Global filter “Private material” marks this node sensitive.');
  expect(describeSensitivityCause(filter, { filterId: filter.id, event: 'enabled' })).toContain('was enabled for this bundle');
  expect(describeSensitivityCause(filter, { filterId: 'another-filter', event: 'created' })).not.toContain('was added');
  expect(describeSensitivityCause({ ...filter, scope: 'bundle' }, { filterId: filter.id, event: 'edited' })).toBe('Bundle filter “Private material” was edited and now marks this node sensitive.');
});

it('stages blacklisting instead of untracking, reviews its scope effects, and restores questions on discard', async () => {
  saveGlobalCustomFilters(home, { filters: [{ ...filter, selectors: [{ field: 'title', matchType: 'regex', value: '^(Child|Leaf)$' }] }], version: '1.0.0' });
  let review = await reviewSourceProposal(directory);
  expect(Object.values(review.proposal.tracking).filter(choice => choice.needsConfirmation)).toHaveLength(2);
  const saved = fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8');
  const blacklist = async () => {
    const configuration = globalThis.structuredClone(review.proposal.proposed);
    configuration.nodes.find(node => node.bundleNodeName === 'Child')!.listType = 'blacklist';
    await updateSourceProposalCapture(directory, review.proposal.revision, { configuration });
    review = await reviewSourceProposal(directory);
  };
  await blacklist();
  expect(review.proposal.tracking).toEqual({});
  expect(review.configuration.nodes.find(node => node.bundleNodeName === 'Child')?.listType).toBe('blacklist');
  expect(review.orphans.some(node => node.title === 'Leaf')).toBe(true);
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(saved);
  await discardSourceProposal(directory, review.proposal.revision);
  review = await reviewSourceProposal(directory);
  expect(Object.values(review.proposal.tracking).filter(choice => choice.needsConfirmation)).toHaveLength(2);
  await blacklist();
  await acceptSourceProposal(directory, review.reviewToken);
  const accepted = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(accepted.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Child').listType).toBe('blacklist');
  expect(accepted.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Leaf')).toBe(false);
  expect(fs.existsSync(path.join(home, 'sources/Leaf.md'))).toBe(true);
});


it('keeps pending command assessments reviewable and prevents acceptance, depth tracking, and removal of sensitive reminders', async () => {
  const script = path.join(home, 'classifier.mjs');
  const release = path.join(home, 'release');
  fs.writeFileSync(script, `import fs from 'node:fs';import {setTimeout} from 'node:timers/promises';let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input);while(!fs.existsSync(${JSON.stringify(release)}))await setTimeout(10);process.stdout.write(JSON.stringify({version:1,results:request.nodes.map(node=>({id:node.id,selected:node.name==='Start'}))}));`);
  const commandFilter: CustomFilterConfig = { ...filter, selectors: [{ field: 'command', matchType: 'substring', value: '', command: { executable: process.execPath, args: [script], batchSize: 1, maxConcurrency: 2 } }] };
  saveGlobalCustomFilters(home, { filters: [commandFilter], version: '1.0.0' });
  const filename = path.join(directory, 'config/bundle_node_config.yaml');
  const config = YAML.parse(fs.readFileSync(filename, 'utf8'));
  config.nodes = config.nodes.filter((node: { bundleNodeName: string }) => node.bundleNodeName !== 'Leaf');
  fs.writeFileSync(filename, YAML.stringify(config));
  try {
    fs.writeFileSync(path.join(home, 'sources/New.md'), 'A newly captured page.');
    fs.appendFileSync(path.join(home, 'sources/Child.md'), '\n[[New]]');
    const scanned = await scanWithTrackingAssessment(directory, true, true);
    expect(scanned.trackingSensitivity, JSON.stringify(scanned.changes)).toEqual(expect.objectContaining({ 'New.md': 'incomplete' }));
    let review = await reviewSourceProposal(directory);
    expect(review.trackingTargets['file:Start.md'].assessmentIncomplete).toBeTruthy();
    await expect(acceptSourceProposal(directory, review.reviewToken)).rejects.toThrow('assessment is incomplete');
    await expect(mutateBundleNode('review', { kind: 'path', value: 'Leaf.md' }, { operation: 'set-depths', outlinksDepth: 1 })).rejects.toThrow('assessment is incomplete');
    fs.writeFileSync(release, '');
    await expect.poll(async () => {
      review = await reviewSourceProposal(directory);
      return Object.values(review.trackingTargets).some(target => target.assessmentIncomplete);
    }).toBe(false);
    expect(review.proposal.tracking['file:Start.md']).toMatchObject({ sensitivityChange: true, needsConfirmation: true });
    controlCommandFilter(directory, filter.id, 'rerun');
    review = await reviewSourceProposal(directory);
    expect(review.proposal.tracking['file:Start.md'].sensitivityChange).toBe(true);
    await expect(acceptSourceProposal(directory, review.reviewToken)).rejects.toThrow('assessment is incomplete');
  } finally { stopCommandFilter(directory, filter.id); stopCommandFilterProcesses(); }
}, 15000);

import { mutateBundleNode } from '../../../../src/areas/bundle/curation/services/bundleNodeOperations.js';
import { scanWithTrackingAssessment } from '../../../../src/areas/bundle/sourcing/services/reviewWithTrackingAssessment.js';
import { controlCommandFilter, stopCommandFilter, stopCommandFilterProcesses } from '../../../../src/shared/custom-filters/commandFilterEvaluation.js';
