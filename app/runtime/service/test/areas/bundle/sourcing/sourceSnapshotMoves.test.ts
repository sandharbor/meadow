/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { describe, expect, it, vi } from 'vitest';
import { acceptSourceSnapshot, findSourceMoves, scanSourceChanges, sourcingReview, sourceComparison } from '../../../../src/areas/bundle/sourcing/services/sourceReview.js';
import { acceptedSourceRoot, initializeSourcing, loadSourceNodeConfigs, loadSourceSnapshot, loadSourcingState, nodeSourcePath, snapshotSourceRoot, sourcingRoot, writeSourcingJson, sourceConfigFingerprint, withSourcingLock } from '../../../../src/shared/source-snapshot/sourceSnapshots.js';
import { getFolderBundleRepairStatus } from '../../../../src/shared/bundle-config/folderBundleRepair.js';
import { loadTrackingRecords } from '../../../../src/shared/bundle-node/trackingRecords.js';
import { sourceFilePathToBundleNodeKey } from '../../../../src/shared/bundle-node/nodeKeys.js';
import { proposalMoveEvidence } from '../../../../src/areas/bundle/sourcing/services/proposalMoveEvidence.js';
import { ensureTrackedPageContent } from '../../../../src/areas/bundle/generation/source-material/trackedPageContent.js';
import { acceptAllMoves, changeSource, newName, oldName, useBigGraphSnapshotHome } from './bigGraphSnapshotHome.js';

vi.mock('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js', async importOriginal => ({ ...await importOriginal<typeof import('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js')>(), commitChangesNative: vi.fn(async () => undefined) }));
let bundle: string;
let source: string;
useBigGraphSnapshotHome(home => ({ bundle, source } = home));
function change(changeId: string) { return changeSource(source, changeId); }

// Each test builds a fresh big-graph home and captures it with Git; the first
// in a worker also pays warmup, which exceeds the default under a full suite.
describe('source snapshot moves and orphans with the shared big graph', { timeout: 20000 }, () => {
  it('classifies a linked group move together instead of orphaning the page with rewritten links', async () => {
    const before = await sourcingReview(bundle);
    change('rename-linked-group');
    const pending = await scanSourceChanges(bundle);
    const movedPaths = [
      't001/t001 ---- child 1.md',
      't001/deeper/t001 ---- child 2.md',
      't001/t001 ---- child 3 in same dir as child 1.md',
    ];
    expect(pending.moves.map(move => move.oldPath)).toEqual(expect.arrayContaining(movedPaths));
    expect(pending.moves.find(move => move.oldPath === movedPaths[2])?.evidence.join(' ')).toContain('folder move');
    expect(pending.orphans.map(orphan => orphan.bundleNodeId)).toEqual(before.orphans.map(orphan => orphan.bundleNodeId));
    for (const move of pending.moves) {
      expect(pending.orphans.some(orphan => orphan.bundleNodeId === move.bundleNodeId || [move.oldPath, move.newPath].includes(orphan.path))).toBe(false);
      expect(pending.changes.some(item => [move.oldPath, move.newPath].includes(item.path))).toBe(false);
    }
    const inferred = pending.moves.find(move => move.oldPath === movedPaths[2])!;
    await expect(acceptSourceSnapshot(bundle, { candidateId: pending.candidate!.id, reviewToken: pending.reviewToken, resolutions: {}, orphanRemovals: [inferred.bundleNodeId] })).rejects.toThrow('Only removable');
    const accepted = await acceptSourceSnapshot(bundle, { candidateId: pending.candidate!.id, reviewToken: pending.reviewToken, resolutions: {} });
    expect(accepted.orphans).toHaveLength(0);
  });

  it.each(['unrelated replacement', 'only one matching sibling'])('does not invent a group move for %s', async reason => {
    await initializeSourcing(bundle);
    change('rename-linked-group');
    const unmatched = 't001/t001 ---- child 3 in same dir as child 1.md';
    const changed = reason === 'unrelated replacement' ? 't101/t101 ---- child 3 in same dir as child 1.md' : 't101/deeper/t101 ---- child 2.md';
    fs.writeFileSync(path.join(source, changed), 'An entirely unrelated document about weather observations and ocean currents.');
    const pending = await scanSourceChanges(bundle);
    expect(pending.moves.some(move => move.oldPath === unmatched)).toBe(false);
    expect(pending.orphans.some(orphan => orphan.path === unmatched)).toBe(true);
  });

  it('reads each source file at most once when matching several missing pages', async () => {
    await initializeSourcing(bundle);
    change('move-nested-group');
    const review = await scanSourceChanges(bundle);
    const previous = loadSourceSnapshot(bundle, review.accepted.id);
    const current = loadSourceSnapshot(bundle, review.candidate!.id);
    const configs = loadSourceNodeConfigs(bundle);
    const reads = vi.spyOn(fs, 'readFileSync');
    let matches;
    let filenames: unknown[];
    try {
      matches = findSourceMoves(bundle, previous, current, configs);
      filenames = reads.mock.calls.map(([filename]) => filename);
    } finally { reads.mockRestore(); }
    expect(matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ oldPath: 't001/t001 ---- child 1.md', newPath: 'source-changes/nested/t001 ---- child 1.md' }),
      expect.objectContaining({ oldPath: 't001/deeper/t001 ---- child 2.md', newPath: 'source-changes/nested/deeper/t001 ---- child 2.md' }),
    ]));
    expect(filenames.length).toBeGreaterThan(0);
    expect(new Set(filenames).size).toBe(filenames.length);
  });

  it('reuses proposal matching evidence and invalidates it when routes, captures, or identities change', async () => {
    await initializeSourcing(bundle);
    change('move-nested-group');
    const review = await scanSourceChanges(bundle);
    const previous = loadSourceSnapshot(bundle, review.accepted.id);
    const current = loadSourceSnapshot(bundle, review.candidate!.id);
    const configs = loadSourceNodeConfigs(bundle);
    const first = proposalMoveEvidence(bundle, previous, current, configs);
    expect(first.length).toBeGreaterThan(0);
    const reads = vi.spyOn(fs, 'readFileSync');
    try {
      const next = proposalMoveEvidence(bundle, previous, current, configs);
      expect(next).toEqual(first);
      expect(reads).not.toHaveBeenCalled();
      next[0].evidence.push('Caller annotation');
      expect(proposalMoveEvidence(bundle, previous, current, configs)).toEqual(first);
      const graph = globalThis.structuredClone(current.graph!);
      graph.nodes[0].path = [];
      graph.allInlinkSources['file:extra-route'] = ['file:new-link'];
      proposalMoveEvidence(bundle, previous, { ...current, graph }, configs);
      expect(reads).toHaveBeenCalled();
      reads.mockClear();
      proposalMoveEvidence(bundle, previous, { ...current, digest: 'changed-capture' }, configs);
      expect(reads).toHaveBeenCalled();
      reads.mockClear();
      proposalMoveEvidence(bundle, previous, current, configs.slice(1));
      expect(reads).toHaveBeenCalled();
    } finally { reads.mockRestore(); }
  });

  it('reviews and removes existing orphans without creating another source snapshot', async () => {
    const review = await sourcingReview(bundle);
    expect(review.orphans).toHaveLength(13);
    const removable = review.orphans.filter(item => !item.removalBlockedReason);
    const sourceFiles = removable.map(item => [item.path, fs.existsSync(path.join(source, item.path))] as const);
    const result = await acceptSourceSnapshot(bundle, { candidateId: review.accepted.id, reviewToken: review.reviewToken, resolutions: {} });
    expect(result.accepted.id).toBe(review.accepted.id);
    expect(result.history).toHaveLength(1);
    expect(result.orphans).toHaveLength(0);
    for (const [filename, existed] of sourceFiles) expect(fs.existsSync(path.join(source, filename))).toBe(existed);
    expect(loadSourceNodeConfigs(bundle).some(node => removable.some(item => item.bundleNodeId === node.bundleNodeId))).toBe(false);
    await expect(acceptSourceSnapshot(bundle, { candidateId: review.accepted.id, reviewToken: review.reviewToken, resolutions: {}, orphanRemovals: [removable[0].bundleNodeId] })).rejects.toThrow('stale');
  });

  it('cleans every eligible orphan even when a legacy caller names only one removal', async () => {
    const review = await sourcingReview(bundle);
    const removable = review.orphans.filter(item => !item.removalBlockedReason);
    expect(removable.length).toBeGreaterThan(1);
    const accepted = await acceptSourceSnapshot(bundle, { candidateId: review.accepted.id, reviewToken: review.reviewToken, resolutions: {}, orphanRemovals: [removable[0].bundleNodeId] });
    expect(accepted.orphans).toHaveLength(0);
    expect(loadSourceNodeConfigs(bundle).some(item => removable.some(orphan => orphan.bundleNodeId === item.bundleNodeId))).toBe(false);
    expect(accepted.history).toHaveLength(1);
  });

  it('shows a candidate orphan before acceptance and applies its removal with the snapshot', async () => {
    const before = await sourcingReview(bundle);
    change('remove-incoming-link');
    const pending = await scanSourceChanges(bundle);
    const newlyOrphaned = pending.orphans.find(item => item.path === 't001/deeper/t001 ---- child 2.md')!;
    expect(newlyOrphaned.reason).toContain('no longer links to');
    expect(pending.changes.some(item => item.path === newlyOrphaned.path)).toBe(false);
    expect(before.orphans.some(item => item.bundleNodeId === newlyOrphaned.bundleNodeId)).toBe(false);
    expect(loadSourceNodeConfigs(bundle).some(node => node.bundleNodeId === newlyOrphaned.bundleNodeId)).toBe(true);
    const result = await acceptSourceSnapshot(bundle, { candidateId: pending.candidate!.id, reviewToken: pending.reviewToken, resolutions: {} });
    expect(result.accepted.id).toBe(pending.candidate!.id);
    expect(result.orphans.some(item => item.bundleNodeId === newlyOrphaned.bundleNodeId)).toBe(false);
    expect(fs.existsSync(path.join(source, newlyOrphaned.path))).toBe(true);
  });

  it('rejects removals of reachable entries and possible moves', async () => {
    const before = await sourcingReview(bundle);
    const reachable = loadSourceNodeConfigs(bundle).find(node => nodeSourcePath(node) === oldName)!;
    await expect(acceptSourceSnapshot(bundle, { candidateId: before.accepted.id, reviewToken: before.reviewToken, resolutions: {}, orphanRemovals: [reachable.bundleNodeId] })).rejects.toThrow('Only removable');
    change('rename-page-with-links');
    const pending = await scanSourceChanges(bundle);
    expect(pending.orphans.some(item => item.bundleNodeId === reachable.bundleNodeId)).toBe(false);
    await expect(acceptSourceSnapshot(bundle, { candidateId: pending.candidate!.id, reviewToken: pending.reviewToken, resolutions: { [reachable.bundleNodeId]: newName }, orphanRemovals: [reachable.bundleNodeId] })).rejects.toThrow('Only removable');
  });

  it('keeps accepted source and configuration stable during review, then preserves identity and settings on a move', async () => {
    const before = await sourcingReview(bundle);
    const node = loadSourceNodeConfigs(bundle).find(item => nodeSourcePath(item) === oldName)!;
    const originalConfig = sourceConfigFingerprint(bundle);
    change('rename-page-with-links');
    const pending = await scanSourceChanges(bundle);
    expect(pending.accepted.id).toBe(before.accepted.id);
    expect(sourceConfigFingerprint(bundle)).toBe(originalConfig);
    expect(fs.existsSync(path.join(acceptedSourceRoot(bundle), oldName))).toBe(true);
    expect(pending.moves.find(move => move.bundleNodeId === node.bundleNodeId)).toMatchObject({ newPath: newName, confidence: 'strong', evidence: expect.arrayContaining(['Identical non-blank file contents']) });
    const accepted = await acceptSourceSnapshot(bundle, { candidateId: pending.candidate!.id, reviewToken: pending.reviewToken, resolutions: {} });
    expect(accepted.accepted.id).toBe(pending.candidate!.id);
    expect(accepted.candidate).toBeUndefined();
    expect(loadSourceNodeConfigs(bundle).find(item => item.bundleNodeId === node.bundleNodeId)).toEqual({ ...node, bundleNodeName: path.basename(newName, '.md'), sourceGraphSubdirectory: '' });
    expect(accepted.orphans.some(item => item.bundleNodeId === node.bundleNodeId)).toBe(false);
    expect(accepted.history).toHaveLength(2);
  });

  it('recognizes a move that happened before a legacy bundle first captures a snapshot', async () => {
    const retained = path.join(bundle, 'raw/tracked_page_content', oldName);
    fs.mkdirSync(path.dirname(retained), { recursive: true });
    fs.copyFileSync(path.join(source, oldName), retained);
    change('rename-page-with-links');
    await initializeSourcing(bundle);
    expect(fs.existsSync(path.join(acceptedSourceRoot(bundle), oldName))).toBe(true);
    const pending = await scanSourceChanges(bundle);
    expect(pending.moves.find(move => move.oldPath === oldName)?.newPath).toBe(newName);
    await acceptAllMoves(bundle);
    expect(loadSourceNodeConfigs(bundle).some(node => nodeSourcePath(node) === newName)).toBe(true);
  });

  it('removes the orphaned old identity when a match is rejected, leaving the new source untracked', async () => {
    await initializeSourcing(bundle);
    change('rename-page-with-links');
    const pending = await scanSourceChanges(bundle);
    const move = pending.moves.find(item => item.oldPath === oldName)!;
    const result = await acceptSourceSnapshot(bundle, { candidateId: pending.candidate!.id, reviewToken: pending.reviewToken, resolutions: { [move.bundleNodeId]: null } });
    expect(loadSourceNodeConfigs(bundle).some(node => nodeSourcePath(node) === oldName)).toBe(false);
    expect(loadSourceNodeConfigs(bundle).some(node => nodeSourcePath(node) === newName)).toBe(false);
    expect(result.orphans).toHaveLength(0);
    expect((await scanSourceChanges(bundle)).candidate).toBeUndefined();
  });

  it('explains a surviving section link to a deleted file without confusing scope or offline sources with deletion', async () => {
    await initializeSourcing(bundle);
    const contents = fs.readFileSync(path.join(source, oldName), 'utf8');
    change('delete-linked-section');
    const pending = await scanSourceChanges(bundle);
    const deleted = pending.orphans.find(item => item.path === oldName)!;
    expect(deleted.diagnosis).toEqual({ kind: 'missing-file', from: 't003 - link to section.md', to: oldName });
    expect(deleted.reason).toBe(`t003 - link to section.md links to ${oldName}, but that file does not exist in the filesystem.`);
    fs.renameSync(source, `${source}-offline`);
    const offline = await sourcingReview(bundle);
    expect(offline.orphans.find(item => item.path === oldName)?.diagnosis?.kind).not.toBe('missing-file');
    fs.renameSync(`${source}-offline`, source);
    fs.writeFileSync(path.join(source, oldName), contents);
    const restored = await sourcingReview(bundle);
    expect(restored.orphans.find(item => item.path === oldName)?.diagnosis).toEqual({ kind: 'outside-graph', to: oldName });
  });

  it('keeps an unreachable move outside the snapshot and explains the broken historical link', async () => {
    await initializeSourcing(bundle);
    change('rename-page-without-links');
    const pending = await scanSourceChanges(bundle);
    const orphan = pending.orphans.find(item => item.path === oldName);
    expect(orphan?.brokenConnection).toEqual({ from: sourceFilePathToBundleNodeKey('t003 - link to section.md'), to: sourceFilePathToBundleNodeKey(oldName) });
    expect(orphan?.previousPath).toContain(sourceFilePathToBundleNodeKey(oldName));
  });

  it('explains link removal without inventing a rename and retains tracking metadata outside config', async () => {
    await initializeSourcing(bundle);
    change('remove-incoming-link');
    const pending = await scanSourceChanges(bundle);
    expect(pending.moves).toHaveLength(0);
    const orphan = pending.orphans.find(item => item.path === 't001/deeper/t001 ---- child 2.md');
    const result = await acceptAllMoves(bundle);
    expect(result.orphans).toHaveLength(0);
    expect(orphan?.reason).toContain('no longer links to');
    expect(orphan?.previousPath.length).toBeGreaterThan(1);
    expect(loadTrackingRecords(bundle)[orphan!.bundleNodeId].lastReachable?.snapshotId).toBe(pending.accepted.id);
    expect(fs.readFileSync(path.join(bundle, 'config/bundle_node_config.yaml'), 'utf8')).not.toContain('trackingEvidence:');
  });

  it('projects generation material from the accepted snapshot while updates are pending and the live graph is unavailable', async () => {
    await initializeSourcing(bundle);
    const original = fs.readFileSync(path.join(acceptedSourceRoot(bundle), oldName));
    change('replace-section-page');
    const pending = await scanSourceChanges(bundle);
    const comparison = sourceComparison(bundle, pending.accepted.id, pending.candidate!.id, oldName, oldName);
    expect(comparison.before).not.toEqual(comparison.after);
    fs.renameSync(source, `${source}-offline`);
    await ensureTrackedPageContent(bundle, acceptedSourceRoot(bundle));
    expect(fs.readFileSync(path.join(bundle, 'raw/tracked_page_content', oldName))).toEqual(original);
    await expect(scanSourceChanges(bundle, true)).rejects.toThrow(/unavailable/);
    expect(loadSourcingState(bundle)?.acceptedId).toBe(pending.accepted.id);
  });

  it('identifies a mistyped snapshot without applying it and accepts the exact reviewed ID', async () => {
    await initializeSourcing(bundle);
    change('replace-section-page');
    const pending = await scanSourceChanges(bundle);
    const candidateId = pending.candidate!.id;
    const request = { candidateId, reviewToken: pending.reviewToken, resolutions: {} };
    const before = loadSourcingState(bundle);
    await expect(acceptSourceSnapshot(bundle, { ...request, candidateId: `${candidateId}8` }))
      .rejects.toThrow(`Snapshot '${candidateId}8' does not match the reviewed snapshot '${candidateId}'`);
    expect(loadSourcingState(bundle)).toEqual(before);
    const accepted = await acceptSourceSnapshot(bundle, request);
    expect(accepted.accepted.id).toBe(candidateId);
    expect(accepted.candidate).toBeUndefined();
  });

  it('rejects stale reviews, altered captures, and paths outside the snapshot', async () => {
    await initializeSourcing(bundle);
    change('rename-page-with-links');
    const pending = await scanSourceChanges(bundle);
    const request = { candidateId: pending.candidate!.id, reviewToken: pending.reviewToken, resolutions: {} };
    await expect(acceptSourceSnapshot(bundle, { ...request, reviewToken: 'stale' })).rejects.toThrow(/stale/);
    fs.appendFileSync(path.join(snapshotSourceRoot(bundle, request.candidateId), newName), '\nUnexpected mutation.');
    await expect(acceptSourceSnapshot(bundle, request)).rejects.toThrow(/changed on disk/);
    expect(() => sourceComparison(bundle, pending.accepted.id, '0'.repeat(32), '../outside', '../outside')).toThrow(/not available/);
    expect(loadSourcingState(bundle)?.acceptedId).toBe(pending.accepted.id);
  });

  it.each(['', ' \n\t\n'])('keeps a blank missing page orphaned and a blank replacement new (%j)', async contents => {
    fs.writeFileSync(path.join(source, oldName), contents);
    await initializeSourcing(bundle);
    fs.renameSync(path.join(source, oldName), path.join(source, newName));
    fs.appendFileSync(path.join(source, 'main page.md'), `\n[[${path.basename(newName, '.md')}]]`);
    const pending = await scanSourceChanges(bundle);
    expect(pending.moves.some(move => move.oldPath === oldName)).toBe(false);
    expect(pending.orphans.some(orphan => orphan.path === oldName)).toBe(true);
    expect(pending.changes).toContainEqual(expect.objectContaining({ path: newName, kind: 'added' }));
    const orphan = pending.orphans.find(item => item.path === oldName)!;
    const accepted = await acceptSourceSnapshot(bundle, { candidateId: pending.candidate!.id,
      reviewToken: pending.reviewToken, resolutions: {} });
    expect(loadSourceNodeConfigs(bundle).some(node => node.bundleNodeId === orphan.bundleNodeId)).toBe(false);
    expect(loadSourceNodeConfigs(bundle).find(node => nodeSourcePath(node) === newName)).toBeUndefined();
    expect(accepted.trackingRequest).toBeUndefined();
  });

  it('requires an explicit choice when identical contents have more than one destination', async () => {
    await initializeSourcing(bundle);
    change('rename-page-with-links');
    fs.copyFileSync(path.join(source, newName), path.join(source, 'duplicate section.md'));
    fs.appendFileSync(path.join(source, 't003 - link to section.md'), '\n[[duplicate section]]');
    const pending = await scanSourceChanges(bundle);
    const matches = pending.moves.filter(move => move.oldPath === oldName);
    expect(matches).toHaveLength(2);
    expect(matches.every(move => move.competing)).toBe(true);
    const nodesBefore = loadSourceNodeConfigs(bundle);
    await expect(acceptSourceSnapshot(bundle, { candidateId: pending.candidate!.id,
      reviewToken: pending.reviewToken, resolutions: {} })).rejects.toThrow('Choose how to resolve competing source moves');
    expect(loadSourceNodeConfigs(bundle)).toEqual(nodesBefore);
    const result = await acceptSourceSnapshot(bundle, { candidateId: pending.candidate!.id,
      reviewToken: pending.reviewToken, resolutions: { [matches[0].bundleNodeId]: matches[0].newPath } });
    expect(result.candidate).toBeUndefined();
    expect(loadSourceNodeConfigs(bundle).find(node => node.bundleNodeId === matches[0].bundleNodeId)?.bundleNodeName).toBe(path.basename(matches[0].newPath, '.md'));
    expect(loadSourceNodeConfigs(bundle).some(node => nodeSourcePath(node) === 'duplicate section.md')).toBe(false);
  });

  it.each([
    { changeId: 'move-and-edit-page', oldPath: 't024 - markdown links.md', confidence: 'possible', evidence: 'blocks unchanged' },
    { changeId: 'move-tracked-image', oldPath: 't024/t024 ---- test image.png', confidence: 'strong', evidence: 'Identical non-blank file contents' },
  ])('matches $changeId through the shared Source Change', async ({ changeId, oldPath, confidence, evidence }) => {
    await initializeSourcing(bundle);
    change(changeId);
    const pending = await scanSourceChanges(bundle);
    const move = pending.moves.find(item => item.oldPath === oldPath);
    expect(move?.confidence).toBe(confidence);
    expect(move?.contentChanged).toBe(changeId === 'move-and-edit-page');
    expect(move?.evidence.some(item => item.includes(evidence))).toBe(true);
    await acceptAllMoves(bundle);
    expect(loadSourceNodeConfigs(bundle).some(node => nodeSourcePath(node) === move!.newPath)).toBe(true);
  });

  it.each(['deleted', 'moved'])('requires user repair when the starting page is %s and preserves accepted sources', async action => {
    const initial = await initializeSourcing(bundle);
    const config = YAML.parse(fs.readFileSync(path.join(bundle, 'config/bundle_config.yaml'), 'utf8'));
    const entry = loadSourceNodeConfigs(bundle).find(node => node.bundleNodeId === config.entryBundleNodeId)!;
    const filename = path.join(source, nodeSourcePath(entry));
    if (action === 'deleted') fs.unlinkSync(filename);
    else fs.renameSync(filename, path.join(source, 'relocated starting page.md'));
    await expect(scanSourceChanges(bundle)).rejects.toThrow(/starting page is missing.*Locate its replacement/);
    expect(loadSourcingState(bundle)?.acceptedId).toBe(initial.acceptedId);
    expect(loadSourcingState(bundle)?.candidateId).toBeUndefined();
    expect(fs.existsSync(path.join(acceptedSourceRoot(bundle), nodeSourcePath(entry)))).toBe(true);
    expect(loadSourceNodeConfigs(bundle).find(node => node.bundleNodeId === entry.bundleNodeId)).toEqual(entry);
  });

  it('recovers node configuration, bundle tracking preference, and snapshot identity after an interrupted acceptance', async () => {
    const state = await initializeSourcing(bundle);
    const configPath = path.join(bundle, 'config/bundle_node_config.yaml');
    const nodeConfig = fs.readFileSync(configPath, 'utf8');
    change('rename-page-with-links');
    const pending = await scanSourceChanges(bundle);
    const previous = loadSourcingState(bundle)!;
    const bundleConfigPath = path.join(bundle, 'config/bundle_config.yaml');
    const bundleConfig = fs.readFileSync(bundleConfigPath, 'utf8');
    writeSourcingJson(path.join(sourcingRoot(bundle), 'acceptance-journal.json'), { state: previous, nodeConfig, bundleConfig });
    fs.writeFileSync(bundleConfigPath, YAML.stringify({ ...YAML.parse(bundleConfig), trackNewPages: false }));
    fs.writeFileSync(configPath, 'interrupted write');
    writeSourcingJson(path.join(sourcingRoot(bundle), 'state.json'), { ...previous, acceptedId: pending.candidate!.id });
    expect(loadSourcingState(bundle)?.acceptedId).toBe(state.acceptedId);
    expect(fs.readFileSync(configPath, 'utf8')).toBe(nodeConfig);
    expect(fs.readFileSync(bundleConfigPath, 'utf8')).toBe(bundleConfig);
    expect(fs.existsSync(path.join(sourcingRoot(bundle), 'acceptance-journal.json'))).toBe(false);
  });

  it('keeps an accepted folder snapshot usable while its moved starting folder requires repair', async () => {
    const configPath = path.join(bundle, 'config/bundle_config.yaml');
    const config = YAML.parse(fs.readFileSync(configPath, 'utf8'));
    const folderId = config.entryBundleNodeId;
    fs.writeFileSync(path.join(bundle, 'config/bundle_node_config.yaml'), YAML.stringify({ nodes: [{
      bundleNodeId: folderId, bundleNodeKind: 'folder', bundleNodeName: 't001', sourceGraphSubdirectory: 't001', listType: 'whitelist',
    }] }));
    config.defaultTraversalBundleNodeId = folderId;
    fs.writeFileSync(configPath, YAML.stringify(config));
    await initializeSourcing(bundle);
    fs.renameSync(path.join(source, 't001'), path.join(source, 'moved-t001'));
    expect(getFolderBundleRepairStatus(bundle).repairRequired).toBe(false);
    const acceptedId = loadSourcingState(bundle)!.acceptedId;
    await expect(scanSourceChanges(bundle)).rejects.toThrow(/selected folder.*missing/);
    expect(loadSourcingState(bundle)!.acceptedId).toBe(acceptedId);
    expect(loadSourcingState(bundle)!.candidateId).toBeUndefined();
    expect(loadSourceNodeConfigs(bundle)[0]).toMatchObject({ bundleNodeId: folderId, sourceGraphSubdirectory: 't001' });
    expect(getFolderBundleRepairStatus(bundle).repairRequired).toBe(false);
  });

  it('does not capture during generation lookup and serializes snapshot acceptance against readers', async () => {
    expect(() => acceptedSourceRoot(bundle)).toThrow(/first source snapshot/);
    expect(loadSourcingState(bundle)).toBeNull();
    const initialized = await initializeSourcing(bundle);
    change('delete-nested-page');
    const pending = await scanSourceChanges(bundle);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const reader = withSourcingLock(bundle, async () => { entered(); await hold; expect(loadSourcingState(bundle)?.acceptedId).toBe(initialized.acceptedId); });
    await started;
    const acceptance = acceptSourceSnapshot(bundle, { candidateId: pending.candidate!.id, reviewToken: pending.reviewToken, resolutions: {} });
    release();
    await reader;
    await acceptance;
    expect(loadSourceSnapshot(bundle, initialized.acceptedId).files['t001/deeper/t001 ---- child 2.md']).toBeDefined();
  });
});
