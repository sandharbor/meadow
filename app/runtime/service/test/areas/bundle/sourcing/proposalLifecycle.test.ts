/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BundleNodeId } from '../../../../../../contracts/types/bundleNodeConfig.js';
import { initializeSourcing, loadSourceBundleConfig, loadSourceNodeConfigs, loadSourceSnapshot, loadSourcingState,
  snapshotSourceRoot } from '../../../../src/shared/source-snapshot/sourceSnapshots.js';
import { sourceProposalComparison } from '../../../../src/areas/bundle/sourcing/services/proposalComparison.js';
import { applyBlacklistEdit, undoBlacklistEdit } from '../../../../src/areas/bundle/sourcing/services/blacklistReview.js';
import { reviewSourceProposal } from '../../../../src/areas/bundle/sourcing/services/proposalReview.js';
import { updateSourceProposalCapture, checkSourceProposalUpdates } from '../../../../src/areas/bundle/sourcing/services/proposalCapture.js';
import { acceptSourceProposal } from '../../../../src/areas/bundle/sourcing/services/proposalAcceptance.js';
import { discardSourceProposal, loadPendingSourceProposal } from '../../../../src/areas/bundle/sourcing/services/proposalStore.js';
import { chooseProposalIdentities, chooseProposalTracking, resolveProposalConflicts } from '../../../../src/areas/bundle/sourcing/services/proposalDecisions.js';
import { fileNodeKeyFromSourceFilePath, serializeBundleNodeKey } from '../../../../../../shared_code/utils/bundleNodeKey.js';

vi.mock('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js')>(), commitChangesNative: vi.fn(async () => undefined),
}));

let home: string, directory: string, source: string, priorHome: string | undefined;
const startId = 'start0000001' as BundleNodeId;
const bridgeId = 'bridge000001' as BundleNodeId;
const leafId = 'leaf00000001' as BundleNodeId;
const key = (filename: string) => serializeBundleNodeKey(fileNodeKeyFromSourceFilePath(filename));
function configFile(name: string): string { return path.join(directory, 'config', name); }
beforeEach(async () => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-proposal-lifecycle-')));
  priorHome = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = home;
  directory = path.join(home, 'bundles/proposal');
  source = path.join(home, 'sources');
  fs.mkdirSync(path.join(directory, 'config'), { recursive: true });
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'Start.md'), 'The source entry.\n\n[[Bridge]]');
  fs.writeFileSync(path.join(source, 'Bridge.md'), 'This is the substantial and uniquely identifying bridge content.\n\n[[Leaf]]');
  fs.writeFileSync(path.join(source, 'Leaf.md'), 'The leaf remains available for further exploration.\n\n[[Extra]]');
  fs.writeFileSync(path.join(source, 'Extra.md'), 'An extra page outside the initial boundary.');
  fs.writeFileSync(configFile('bundle_config.yaml'), YAML.stringify({ sourceDirectory: source,
    entryBundleNodeId: startId, defaultTraversalBundleNodeId: startId, defaultOutlinksDepth: 2, defaultInlinksDepth: 0 }));
  fs.writeFileSync(configFile('bundle_node_config.yaml'), YAML.stringify({ nodes: [
    { bundleNodeId: startId, bundleNodeName: 'Start', bundleNodeKind: 'file', fileType: 'md', listType: 'whitelist' },
    { bundleNodeId: bridgeId, bundleNodeName: 'Bridge', bundleNodeKind: 'file', fileType: 'md', listType: 'whitelist' },
  ] }));
  await initializeSourcing(directory);
});
afterEach(({ task }) => {
  if (priorHome === undefined) delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  else process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = priorHome;
  if (task.result?.state === 'fail') console.error(`Proposal lifecycle test home retained at ${home}`);
  else fs.rmSync(home, { recursive: true, force: true });
});

describe('captured proposal lifecycle', () => {
  it('revalidates tracking when identity choices change and restores the original identity when reconfirmed', async () => {
    let review = await reviewSourceProposal(directory);
    fs.renameSync(path.join(source, 'Bridge.md'), path.join(source, 'Renamed.md'));
    fs.writeFileSync(path.join(source, 'Start.md'), 'The source entry.\n\n[[Renamed]]');
    await updateSourceProposalCapture(directory, review.proposal.revision, { refresh: true });
    review = await reviewSourceProposal(directory);
    await chooseProposalIdentities(directory, review.proposal.revision, { [bridgeId]: 'Renamed.md' });
    review = await reviewSourceProposal(directory);
    await chooseProposalTracking(directory, review.proposal.revision, [key('Renamed.md')], false);
    review = await reviewSourceProposal(directory);
    expect(review.moves).toHaveLength(1);
    const untracked = await sourceProposalComparison(directory);
    expect(untracked.graph.nodes.find(node => node.bundleNodeName === 'Renamed')?.sourceReview).toMatchObject({ kind: 'moved', previousPath: 'Bridge.md' });
    expect(untracked.graph.nodes.some(node => node.bundleNodeName === 'Bridge')).toBe(false);
    await chooseProposalIdentities(directory, review.proposal.revision, { [bridgeId]: null });
    review = await reviewSourceProposal(directory);
    expect(review.proposal.tracking[key('Renamed.md')].identityChanged).toBe(true);
    await expect(acceptSourceProposal(directory, review.reviewToken)).rejects.toThrow('tracking decisions');
    await chooseProposalTracking(directory, review.proposal.revision, [key('Renamed.md')], true);
    review = await reviewSourceProposal(directory);
    const separateId = review.proposal.tracking[key('Renamed.md')].bundleNodeId;
    expect(separateId).not.toBe(bridgeId);
    await chooseProposalIdentities(directory, review.proposal.revision, { [bridgeId]: 'Renamed.md' });
    review = await reviewSourceProposal(directory);
    expect(review.proposal.tracking[key('Renamed.md')].identityChanged).toBe(true);
    await chooseProposalTracking(directory, review.proposal.revision, [key('Renamed.md')], true);
    review = await reviewSourceProposal(directory);
    expect(review.configuration.nodes.filter(node => node.bundleNodeName === 'Renamed')).toHaveLength(1);
    expect(review.proposal.tracking[key('Renamed.md')].bundleNodeId).toBe(bridgeId);
    await acceptSourceProposal(directory, review.reviewToken);
    expect(loadSourceNodeConfigs(directory).some(node => node.bundleNodeId === separateId)).toBe(false);
    expect(loadSourceNodeConfigs(directory).find(node => node.bundleNodeId === bridgeId)?.bundleNodeName).toBe('Renamed');
  });

  it('recomputes automatic tracking after a rejected rename becomes a confirmed identity', async () => {
    let review = await reviewSourceProposal(directory);
    fs.renameSync(path.join(source, 'Bridge.md'), path.join(source, 'Renamed.md'));
    fs.writeFileSync(path.join(source, 'Start.md'), 'The source entry.\n\n[[Renamed]]');
    await updateSourceProposalCapture(directory, review.proposal.revision, { refresh: true });
    review = await reviewSourceProposal(directory);
    await chooseProposalIdentities(directory, review.proposal.revision, { [bridgeId]: null });
    review = await reviewSourceProposal(directory);
    expect(review.proposal.tracking[key('Renamed.md')]).toMatchObject({ track: true, origin: 'automatic' });
    await chooseProposalIdentities(directory, review.proposal.revision, { [bridgeId]: 'Renamed.md' });
    review = await reviewSourceProposal(directory);
    expect(review.proposal.tracking[key('Renamed.md')]).toBeUndefined();
    expect(review.configuration.nodes.filter(node => node.bundleNodeName === 'Renamed')).toHaveLength(1);
    expect(review.configuration.nodes.find(node => node.bundleNodeName === 'Renamed')?.bundleNodeId).toBe(bridgeId);
  });

  it('explores live frontier only when the admitted material matches the reviewed capture', async () => {
    const initial = await reviewSourceProposal(directory);
    const comparison = await sourceProposalComparison(directory, 1);
    expect(comparison.graph.nodes.find(node => node.bundleNodeName === 'Extra')?.sourceReview?.kind).toBe('frontier');
    expect(loadSourceSnapshot(directory, initial.candidate.id).files['Extra.md']).toBeUndefined();
    fs.appendFileSync(path.join(source, 'Leaf.md'), '\nNewer core links and content.');
    const changed = await sourceProposalComparison(directory, 1);
    expect(changed.frontierUnavailable).toContain('Update sources');
    expect(changed.graph.nodes.some(node => node.bundleNodeName === 'Extra')).toBe(false);
    expect(loadPendingSourceProposal(directory)?.candidateSnapshotId).toBe(initial.candidate.id);
  });

  it('stages blacklist effects beyond the selected node and retains accepted settings', async () => {
    const saved = loadSourceNodeConfigs(directory);
    const bridge = { ...saved.find(node => node.bundleNodeId === bridgeId)!, listType: 'blacklist' as const };
    const result = await applyBlacklistEdit(directory, [bridge]);
    expect(result.mode).toBe('sourcing');
    expect(loadSourceNodeConfigs(directory)).toEqual(saved);
    expect(loadPendingSourceProposal(directory)?.proposed.nodes.find(node => node.bundleNodeId === bridgeId)?.listType).toBe('blacklist');
  });

  it('applies a true leaf shortcut with conditional undo and keeps later changes safe', async () => {
    const saved = loadSourceNodeConfigs(directory);
    const leaf = { bundleNodeId: leafId, bundleNodeName: 'Leaf', bundleNodeKind: 'file' as const, fileType: 'md' as const, listType: 'blacklist' as const };
    const result = await applyBlacklistEdit(directory, [leaf]);
    expect(result.mode).toBe('curation');
    expect(loadPendingSourceProposal(directory)).toBeUndefined();
    if (result.mode !== 'curation') throw new Error('Expected the leaf shortcut');
    await undoBlacklistEdit(directory, result.undo);
    expect(loadSourceNodeConfigs(directory)).toEqual(saved);
    const again = await applyBlacklistEdit(directory, [leaf]);
    if (again.mode !== 'curation') throw new Error('Expected the leaf shortcut');
    const changed = loadSourceNodeConfigs(directory);
    const changedBridge = changed.find(node => node.bundleNodeId === bridgeId)!;
    if (changedBridge.bundleNodeKind !== 'collection') changedBridge.outlinksDepth = 0;
    fs.writeFileSync(configFile('bundle_node_config.yaml'), YAML.stringify({ nodes: changed }));
    await expect(undoBlacklistEdit(directory, again.undo)).rejects.toThrow('Configuration changed');
    expect(loadSourceNodeConfigs(directory)).toEqual(changed);
  });

  it('isolates boundary drafts and accepts exactly the reviewed bytes with their tracking decisions', async () => {
    let review = await reviewSourceProposal(directory);
    const acceptedId = review.accepted.id;
    const draft = structuredClone(review.proposal.proposed);
    draft.bundle.defaultOutlinksDepth = 3;
    await updateSourceProposalCapture(directory, review.proposal.revision, { configuration: draft });
    review = await reviewSourceProposal(directory);
    expect(loadSourceBundleConfig(directory).defaultOutlinksDepth).toBe(2);
    expect(loadSourcingState(directory)?.acceptedId).toBe(acceptedId);
    expect(review.proposal.tracking[key('Extra.md')]).toMatchObject({ track: true, origin: 'automatic' });
    const reviewed = fs.readFileSync(path.join(source, 'Leaf.md'), 'utf8');
    fs.writeFileSync(path.join(source, 'Leaf.md'), 'Newer live content C.\n\n[[Extra]]');
    await checkSourceProposalUpdates(directory);
    review = await reviewSourceProposal(directory);
    expect(review.proposal.newerSourcesAvailable).toBe(true);
    await acceptSourceProposal(directory, review.reviewToken);
    expect(loadPendingSourceProposal(directory)).toBeUndefined();
    expect(loadSourceBundleConfig(directory).defaultOutlinksDepth).toBe(3);
    expect(loadSourceNodeConfigs(directory).some(node => node.bundleNodeName === 'Extra')).toBe(true);
    const state = loadSourcingState(directory)!;
    expect(fs.readFileSync(path.join(snapshotSourceRoot(directory, state.acceptedId), 'Leaf.md'), 'utf8')).toBe(reviewed);
    expect(fs.readFileSync(path.join(source, 'Leaf.md'), 'utf8')).toContain('Newer live content C');
  });

  it('keeps both capture and setting unchanged until newer-source consent is confirmed', async () => {
    const initial = await reviewSourceProposal(directory);
    const draft = structuredClone(initial.proposal.proposed);
    draft.bundle.defaultOutlinksDepth = 3;
    fs.appendFileSync(path.join(source, 'Start.md'), '\nNewer source material.');
    await expect(updateSourceProposalCapture(directory, initial.proposal.revision, { configuration: draft })).rejects.toMatchObject({ code: 'source-refresh-consent' });
    expect(loadPendingSourceProposal(directory)).toEqual(initial.proposal);
    await updateSourceProposalCapture(directory, initial.proposal.revision, { configuration: draft, incorporateNewerSources: true });
    const updated = await reviewSourceProposal(directory);
    expect(updated.proposal.proposed.bundle.defaultOutlinksDepth).toBe(3);
    expect(updated.candidate.id).not.toBe(initial.candidate.id);
    expect(fs.readFileSync(path.join(snapshotSourceRoot(directory, updated.candidate.id), 'Start.md'), 'utf8')).toContain('Newer source material');
  });

  it('recaptures an untracked depth override only with consent when live material changed', async () => {
    let review = await reviewSourceProposal(directory);
    const draft = structuredClone(review.proposal.proposed);
    draft.nodes.find(node => node.bundleNodeId === bridgeId)!.outlinksDepth = 0;
    await updateSourceProposalCapture(directory, review.proposal.revision, { configuration: draft });
    review = await reviewSourceProposal(directory);
    expect((await sourceProposalComparison(directory)).graph.nodes.find(node => node.bundleNodeName === 'Leaf')?.sourceReview?.kind).toBe('departing');
    const before = loadPendingSourceProposal(directory);
    fs.appendFileSync(path.join(source, 'Start.md'), '\nChanged during review.');
    await expect(chooseProposalTracking(directory, review.proposal.revision, [key('Bridge.md')], false)).rejects.toMatchObject({ code: 'source-refresh-consent' });
    expect(loadPendingSourceProposal(directory)).toEqual(before);
    await chooseProposalTracking(directory, review.proposal.revision, [key('Bridge.md')], false, false, true);
    review = await reviewSourceProposal(directory);
    expect(review.candidate.id).not.toBe(before!.candidateSnapshotId);
    expect(review.proposal.tracking[key('Bridge.md')]).toMatchObject({ track: false, origin: 'explicit' });
    expect(review.configuration.nodes.some(node => node.bundleNodeId === bridgeId)).toBe(false);
    expect((await sourceProposalComparison(directory)).graph.nodes.find(node => node.bundleNodeName === 'Leaf')?.sourceReview?.kind).not.toBe('departing');
    expect(fs.readFileSync(path.join(snapshotSourceRoot(directory, review.candidate.id), 'Start.md'), 'utf8')).toContain('Changed during review.');
    expect(loadSourceNodeConfigs(directory).some(node => node.bundleNodeId === bridgeId)).toBe(true);
  });

  it('cleans unreachable blacklist configuration while retaining a reachable exclusion', async () => {
    const nodes = loadSourceNodeConfigs(directory);
    nodes.push({ bundleNodeId: 'ghost0000001' as BundleNodeId, bundleNodeName: 'Ghost', bundleNodeKind: 'file', fileType: 'md', listType: 'blacklist' });
    fs.writeFileSync(configFile('bundle_node_config.yaml'), YAML.stringify({ nodes }));
    let review = await reviewSourceProposal(directory);
    const draft = structuredClone(review.proposal.proposed);
    draft.nodes.find(node => node.bundleNodeId === bridgeId)!.listType = 'blacklist';
    await updateSourceProposalCapture(directory, review.proposal.revision, { configuration: draft });
    review = await reviewSourceProposal(directory);
    await acceptSourceProposal(directory, review.reviewToken);
    expect(loadSourceNodeConfigs(directory).find(node => node.bundleNodeId === bridgeId)?.listType).toBe('blacklist');
    expect(loadSourceNodeConfigs(directory).some(node => node.bundleNodeName === 'Ghost')).toBe(false);
    expect(fs.existsSync(path.join(source, 'Bridge.md'))).toBe(true);
  });

  it('requires resolution of untracking versus later blacklisting and retains unrelated curation', async () => {
    let review = await reviewSourceProposal(directory);
    await chooseProposalTracking(directory, review.proposal.revision, [key('Bridge.md')], false);
    const saved = loadSourceNodeConfigs(directory);
    saved.find(node => node.bundleNodeId === bridgeId)!.listType = 'blacklist';
    saved.push({ bundleNodeId: leafId, bundleNodeName: 'Leaf', bundleNodeKind: 'file', fileType: 'md', listType: 'whitelist' });
    fs.writeFileSync(configFile('bundle_node_config.yaml'), YAML.stringify({ nodes: saved }));
    review = await reviewSourceProposal(directory);
    expect(review.conflicts).toHaveLength(1);
    await expect(acceptSourceProposal(directory, review.reviewToken)).rejects.toThrow('configuration conflicts');
    saved.find(node => node.bundleNodeId === bridgeId)!.outlinksDepth = 0;
    fs.writeFileSync(configFile('bundle_node_config.yaml'), YAML.stringify({ nodes: saved }));
    await expect(resolveProposalConflicts(directory, review.proposal.revision, [{ path: review.conflicts[0].path, choice: 'proposed' }], review.reviewToken)).rejects.toThrow('This conflict changed');
    expect(loadPendingSourceProposal(directory)?.resolutions).toEqual([]);
    review = await reviewSourceProposal(directory);
    await resolveProposalConflicts(directory, review.proposal.revision, [{ path: review.conflicts[0].path, choice: 'proposed' }], review.reviewToken);
    review = await reviewSourceProposal(directory);
    await acceptSourceProposal(directory, review.reviewToken);
    expect(new Set(loadSourceNodeConfigs(directory).map(node => node.bundleNodeId))).toEqual(new Set([startId, leafId]));
  });

  it('keeps failed refreshes recoverable and discards only pending decisions', async () => {
    let review = await reviewSourceProposal(directory);
    const draft = structuredClone(review.proposal.proposed);
    draft.bundle.bundleNotes = 'Draft notes';
    await updateSourceProposalCapture(directory, review.proposal.revision, { configuration: draft });
    review = await reviewSourceProposal(directory);
    fs.renameSync(source, `${source}-disconnected`);
    await expect(updateSourceProposalCapture(directory, review.proposal.revision, { refresh: true })).rejects.toThrow('disconnected');
    expect(loadPendingSourceProposal(directory)).toEqual(review.proposal);
    const saved = loadSourceBundleConfig(directory);
    saved.bundleNotes = 'Accepted after Later';
    fs.writeFileSync(configFile('bundle_config.yaml'), YAML.stringify(saved));
    await discardSourceProposal(directory, review.proposal.revision);
    expect(loadSourceBundleConfig(directory).bundleNotes).toBe('Accepted after Later');
    expect(loadPendingSourceProposal(directory)).toBeUndefined();
    expect(fs.existsSync(`${source}-disconnected/Start.md`)).toBe(true);
  });

  it('gates graph entry on explicit identity choices and carries the chosen stable identity through acceptance', async () => {
    let review = await reviewSourceProposal(directory);
    fs.renameSync(path.join(source, 'Bridge.md'), path.join(source, 'Renamed.md'));
    fs.writeFileSync(path.join(source, 'Start.md'), 'The source entry.\n\n[[Renamed]]');
    await updateSourceProposalCapture(directory, review.proposal.revision, { refresh: true });
    review = await reviewSourceProposal(directory);
    expect(review.unresolvedIdentities).toEqual([bridgeId]);
    await expect(acceptSourceProposal(directory, review.reviewToken)).rejects.toThrow('page identities');
    await chooseProposalIdentities(directory, review.proposal.revision, { [bridgeId]: 'Renamed.md' });
    review = await reviewSourceProposal(directory);
    expect(review.unresolvedIdentities).toEqual([]);
    await acceptSourceProposal(directory, review.reviewToken);
    expect(loadSourceNodeConfigs(directory).find(node => node.bundleNodeId === bridgeId)?.bundleNodeName).toBe('Renamed');
    expect(loadSourceSnapshot(directory, loadSourcingState(directory)!.acceptedId).files['Bridge.md']).toBeUndefined();
  });
});
