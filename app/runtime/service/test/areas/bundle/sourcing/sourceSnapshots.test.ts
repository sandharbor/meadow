/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { scanWithTrackingAssessment } from '../../../../src/areas/bundle/sourcing/services/reviewWithTrackingAssessment.js';
import { sourceCurationWorkflow } from '../../../../src/shared/app-shell/sourceCurationWorkflow.js';
import { trackSnapshotAdditions } from '../../../../src/areas/bundle/curation/services/snapshotTracking.js';
import { loadWorkingGraph } from '../../../../src/shared/bundle-graph/workingGraphService.js';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { materializeSourceGraph, applySourceChange } from '../../../../../../shared_code/shared_dev/sourceChanges.js';
import { acceptSourceSnapshot, findSourceMoves, scanSourceChanges, sourcingReview, sourceComparison, sourceSnapshotImage, sourceSnapshotHistory } from '../../../../src/areas/bundle/sourcing/services/sourceReview.js';
import { acceptedSourceRoot, initializeSourcing, loadSourceNodeConfigs, loadSourceSnapshot, loadSourcingState, nodeSourcePath, snapshotSourceRoot, sourcingRoot, writeSourcingJson, sourceConfigFingerprint, withSourcingLock } from '../../../../src/shared/source-snapshot/sourceSnapshots.js';
import { getFolderBundleRepairStatus } from '../../../../src/shared/bundle-config/folderBundleRepair.js';
import { loadTrackingRecords } from '../../../../src/shared/bundle-node/trackingRecords.js';
import { sourceTraversalGraph } from '../../../../src/areas/bundle/sourcing/services/sourceTraversalGraph.js';
import { ensureTrackedPageContent } from '../../../../src/areas/bundle/generation/source-material/trackedPageContent.js';

vi.mock('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js', async importOriginal => ({ ...await importOriginal<typeof import('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js')>(), commitChangesNative: vi.fn(async () => undefined) }));
const projectRoot = fileURLToPath(new URL('../../../../../../../', import.meta.url));
const sourceGraph = 'meadow-test-bundles-data';
const oldName = 't003 ---- page with section to link to.md';
const newName = 't003 ---- renamed section page.md';
let temporary: string;
let bundle: string;
let source: string;
let priorHome: string | undefined;

beforeEach(() => {
  temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-sourcing-test-')));
  priorHome = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = temporary;
  source = materializeSourceGraph({ projectRoot, sourceGraphsDir: path.join(temporary, 'source_graphs'), sourceGraph });
  bundle = path.join(temporary, 'bundles/meadow-test-bundle-big');
  fs.cpSync(path.join(projectRoot, 'app/shared_data/home_fixtures/home_fixture_big_and_small/bundles/meadow-test-bundle-big'), bundle, { recursive: true });
  const filename = path.join(bundle, 'config/bundle_config.yaml');
  const config = YAML.parse(fs.readFileSync(filename, 'utf8'));
  config.sourceDirectory = source;
  fs.writeFileSync(filename, YAML.stringify(config));
});
afterEach(() => {
  if (priorHome === undefined) delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  else process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = priorHome;
  fs.rmSync(temporary, { recursive: true, force: true });
});
function change(changeId: string) { return applySourceChange({ projectRoot, sourceGraphsDir: path.dirname(source), sourceGraph, changeId }); }

async function acceptAllMoves() {
  const review = await scanSourceChanges(bundle);
  expect(review.candidate).toBeDefined();
  return await acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken,
    resolutions: Object.fromEntries(review.moves.map(move => [move.bundleNodeId, move.newPath])) });
}

describe('source snapshots with the shared big graph', () => {
  it('returns candidate traversal provenance from captured sources without changing the accepted graph', async () => {
    // Given a shortcut to Hub, a different route supplies the budget for a later incoming link.
    source = path.join(temporary, 'traversal-source');
    fs.mkdirSync(source);
    const configPath = path.join(bundle, 'config/bundle_config.yaml');
    const config = YAML.parse(fs.readFileSync(configPath, 'utf8'));
    fs.writeFileSync(configPath, YAML.stringify({ ...config, sourceDirectory: source, defaultOutlinksDepth: 3, defaultInlinksDepth: 1 }));
    fs.writeFileSync(path.join(bundle, 'config/bundle_node_config.yaml'), YAML.stringify({ nodes: [{
      bundleNodeKind: 'file', fileType: 'md', bundleNodeName: 'Start', sourceGraphSubdirectory: '',
      bundleNodeId: config.entryBundleNodeId, listType: 'whitelist',
    }, {
      bundleNodeKind: 'file', fileType: 'md', bundleNodeName: 'Bridge', sourceGraphSubdirectory: '',
      bundleNodeId: 'abcdef012345', listType: 'whitelist', outlinksDepth: 3, inlinksDepth: 2,
    }] }));
    fs.writeFileSync(path.join(source, 'Start.md'), '[[Bridge]] [[Hub]]');
    fs.writeFileSync(path.join(source, 'Bridge.md'), '[[Hub]]');
    fs.writeFileSync(path.join(source, 'Hub.md'), 'The hub');
    const state = await initializeSourcing(bundle);
    fs.writeFileSync(path.join(source, 'Incoming.md'), '[[Hub]]');
    const captured = await scanSourceChanges(bundle);
    // Subsequent live changes must not leak into details for the reviewed capture.
    fs.writeFileSync(path.join(source, 'Incoming.md'), '[[Live only]]');
    fs.writeFileSync(path.join(source, 'Live only.md'), 'Not captured');
    const pending = await sourcingReview(bundle);
    expect(pending.reviewToken).toBe(captured.reviewToken);
    const route = pending.changes.find(item => item.path === 'Incoming.md')!.route;
    expect(route).toEqual(['Start.md', 'Bridge.md', 'Hub.md', 'Incoming.md']);
    const graph = pending.traversalGraphs!.candidate!;
    expect(graph.snapshotId).toBe(pending.candidate!.id);
    expect(graph.nodes.map(node => node.bundleNodeKey).sort()).toEqual([...route!].sort());
    expect(graph.nodes.find(node => node.bundleNodeKey === 'Incoming.md')).toMatchObject({
      path: route, remaining_depth: 1, remaining_inlinks_depth: 0, traversal_details: { link_type: 'inlink' },
      traversal_path_steps: [
        { bundleNodeKey: 'Start.md', depth: 0, remaining_depth: 3, remaining_inlinks_depth: 1, traversal_details: { link_type: 'start' } },
        { bundleNodeKey: 'Bridge.md', depth: 1, remaining_depth: 3, remaining_inlinks_depth: 2, traversal_details: { link_type: 'outlink' } },
        { bundleNodeKey: 'Hub.md', depth: 2, remaining_depth: 2, remaining_inlinks_depth: 1, traversal_details: { link_type: 'outlink' } },
        { bundleNodeKey: 'Incoming.md', depth: 3, remaining_depth: 1, remaining_inlinks_depth: 0, traversal_details: { link_type: 'inlink' } },
      ],
    });
    const hub = graph.nodes.find(node => node.bundleNodeKey === 'Hub.md')!;
    expect(hub.path).toEqual(['Start.md', 'Hub.md']);
    expect(hub.traversal_alternative_routes?.[0].map(step => step.bundleNodeKey)).toEqual(['Start.md', 'Bridge.md', 'Hub.md']);
    expect(hub.traversal_alternative_routes?.[0].at(-1)?.remaining_inlinks_depth).toBe(1);
    // A review of Hub alone still includes the page that explains its alternative arrival.
    const hubReview = sourceTraversalGraph(pending.candidate!.id,
      loadSourceSnapshot(bundle, pending.candidate!.id).graph, [['Start.md', 'Hub.md']]);
    expect(hubReview!.nodes.map(node => node.bundleNodeKey).sort()).toEqual(['Bridge.md', 'Hub.md', 'Start.md']);
    expect(graph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'Incoming.md', target: 'Hub.md' })]));
    expect(pending.traversalGraphs!.accepted!.snapshotId).toBe(state.acceptedId);
    expect(pending.traversalGraphs!.accepted!.nodes.some(node => node.bundleNodeKey === 'Incoming.md')).toBe(false);
    expect(loadSourceSnapshot(bundle, state.acceptedId).files['Incoming.md']).toBeUndefined();
    expect(loadSourcingState(bundle)!.acceptedId).toBe(state.acceptedId);
  });

  it.each([true, false])('hands reviewed additions to curation according to the saved preference %s', async trackNewPages => {
    await initializeSourcing(bundle);
    const initialConfigs = loadSourceNodeConfigs(bundle);
    change('add-linked-page');
    let review = await scanSourceChanges(bundle);
    expect(review.trackNewPages).toBe(true);
    const accepted = await acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {}, trackNewPages });
    expect(accepted.trackingRequest).toEqual(trackNewPages ? {
      snapshotId: review.candidate!.id, nodeKeys: ['source-changes/added field notes.md'],
    } : undefined);
    const removedIds = new Set(review.orphans.filter(orphan => !orphan.removalBlockedReason).map(orphan => orphan.bundleNodeId));
    expect(loadSourceNodeConfigs(bundle)).toEqual(initialConfigs.filter(node => !removedIds.has(node.bundleNodeId)));
    expect(fs.existsSync(path.join(acceptedSourceRoot(bundle), 'source-changes/added field notes.md'))).toBe(true);
    change('add-embedded-image');
    review = await scanSourceChanges(bundle);
    expect(review.trackNewPages).toBe(trackNewPages);
    const next = await acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {} });
    expect(next.trackingRequest).toEqual(trackNewPages ? {
      snapshotId: review.candidate!.id, nodeKeys: ['source-changes/added sunflower.png'],
    } : undefined);
    expect(loadSourceNodeConfigs(bundle).some(node => node.bundleNodeName === 'added sunflower')).toBe(false);
  }, 20000);

  it.each(['direct', 'filter', 'global', 'disabled-global', 'disabled-filter'])('curation safely tracks only reviewed additions with %s sensitivity', async mode => {
    await initializeSourcing(bundle);
    change(`add-${mode === 'direct' ? 'direct' : 'filter'}-sensitive-pages`);
    const shouldSkip = !mode.startsWith('disabled-');
    if (mode !== 'direct') {
      const global = mode.includes('global');
      const filterPath = global ? path.join(temporary, 'app/global_custom_filters.json') : path.join(bundle, 'config/custom_filters.json');
      fs.mkdirSync(path.dirname(filterPath), { recursive: true });
      if (mode === 'disabled-global') {
        const configPath = path.join(bundle, 'config/bundle_config.yaml');
        const config = YAML.parse(fs.readFileSync(configPath, 'utf8'));
        fs.writeFileSync(configPath, YAML.stringify({ ...config, disabledGlobalFilters: ['confidential'] }));
      }
      fs.writeFileSync(filterPath, JSON.stringify({ version: '1.0.0', filters: [{
        id: 'confidential', name: 'Confidential', scope: global ? 'global' : 'bundle', enabled: mode !== 'disabled-filter',
        selectors: [{ field: 'title', matchType: 'substring', value: 'confidential' }],
        selectorApplicationCriteria: 'union', actions: [{ type: 'mark_sensitive' }],
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      }] }));
    }
    const review = await scanWithTrackingAssessment(bundle, false, false);
    const privateKeys = ['source-changes/added confidential notes.md', 'source-changes/added confidential planning.md'];
    expect(review.trackingSensitivity).toEqual(shouldSkip ? Object.fromEntries(privateKeys.map(key => [key, mode === 'direct' ? 'source' : 'filter'])) : {});
    const accepted = await sourceCurationWorkflow.accept(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {}, trackNewPages: true });
    expect(accepted.trackingOutcome?.error).toBeUndefined();
    expect(accepted.trackingOutcome?.trackedNodeKeys).toEqual([...(shouldSkip ? [] : privateKeys), 'source-changes/added public update.md']);
    expect(accepted.reviewToken).toBe((await sourcingReview(bundle)).reviewToken);
    expect(accepted.trackingOutcome?.sensitiveSkipped.map(node => node.bundleNodeKey)).toEqual(shouldSkip ? privateKeys : []);
    const added = loadSourceNodeConfigs(bundle).filter(node => node.bundleNodeName.startsWith('added '));
    expect(added.map(node => node.bundleNodeName)).toEqual([...(shouldSkip ? [] : ['added confidential notes', 'added confidential planning']), 'added public update']);
    expect(loadTrackingRecords(bundle)[added.find(node => node.bundleNodeName === 'added public update')!.bundleNodeId].lastReachable?.path).toBe('source-changes/added public update.md');
    for (const key of privateKeys) expect(fs.existsSync(path.join(acceptedSourceRoot(bundle), key))).toBe(true);
    await expect(trackSnapshotAdditions(bundle, { snapshotId: 'outdated', nodeKeys: privateKeys })).rejects.toThrow(/snapshot changed/);
  }, 20000);

  it('keeps sources accepted and additions untracked when curation cannot evaluate its filters', async () => {
    await initializeSourcing(bundle);
    change('add-linked-page');
    const review = await scanWithTrackingAssessment(bundle, false, false);
    // Simulate a filter document becoming invalid after the user reviewed sources.
    fs.writeFileSync(path.join(bundle, 'config/custom_filters.json'), '{malformed');
    const accepted = await sourceCurationWorkflow.accept(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {} });
    expect(accepted.trackingOutcome?.error).toBeTruthy();
    expect(accepted.trackingOutcome?.otherSkipped.map(node => node.bundleNodeKey)).toEqual(['source-changes/added field notes.md']);
    expect(loadSourcingState(bundle)!.acceptedId).toBe(review.candidate!.id);
    expect(loadSourceNodeConfigs(bundle).some(node => node.bundleNodeName === 'added field notes')).toBe(false);
  }, 20000);

  it('reevaluates sensitivity at tracking time instead of trusting the review badge', async () => {
    await initializeSourcing(bundle);
    change('add-filter-sensitive-pages');
    const review = await scanWithTrackingAssessment(bundle, false, false);
    expect(review.trackingSensitivity).toEqual({});
    fs.writeFileSync(path.join(bundle, 'config/custom_filters.json'), JSON.stringify({ version: '1.0.0', filters: [{
      id: 'confidential', name: 'Confidential', scope: 'bundle', enabled: true,
      selectors: [{ field: 'title', matchType: 'substring', value: 'confidential' }],
      selectorApplicationCriteria: 'union', actions: [{ type: 'mark_sensitive' }],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }] }));
    const accepted = await sourceCurationWorkflow.accept(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {} });
    expect(accepted.trackingOutcome?.error).toBeUndefined();
    expect(accepted.trackingOutcome?.sensitiveSkipped).toHaveLength(2);
    expect(accepted.trackingOutcome?.trackedNodeKeys).toEqual(['source-changes/added public update.md']);
  }, 20000);

  it('reads only accepted history without capturing sources or including a pending candidate', async () => {
    expect(sourceSnapshotHistory(bundle)).toEqual({ acceptedId: null, snapshots: [] });
    expect(loadSourcingState(bundle)).toBeNull();
    const initial = await initializeSourcing(bundle);
    change('rename-page-with-links');
    const pending = await scanSourceChanges(bundle);
    expect(sourceSnapshotHistory(bundle)).toEqual({ acceptedId: initial.acceptedId, snapshots: initial.history });
    expect(sourceSnapshotHistory(bundle).snapshots.some(item => item.id === pending.candidate!.id)).toBe(false);
    await acceptAllMoves();
    const history = sourceSnapshotHistory(bundle);
    expect(history.acceptedId).toBe(pending.candidate!.id);
    expect(history.snapshots.map(item => item.id)).toEqual([initial.acceptedId, pending.candidate!.id]);
  }, 20000);

  it('explains added Markdown and image routes and serves images from their captured snapshots', async () => {
    const state = await initializeSourcing(bundle);
    const imagePath = 't006/t006 --- meadow.png';
    const original = sourceSnapshotImage(bundle, state.acceptedId, imagePath).bytes;
    change('add-linked-page');
    change('add-embedded-image');
    change('modify-embedded-image');
    const review = await scanSourceChanges(bundle);
    const candidateId = review.candidate!.id;
    expect(review.changes.find(item => item.path === 'source-changes/added field notes.md')).toMatchObject({ kind: 'added', route: expect.arrayContaining(['main page.md']) });
    const addedImage = 'source-changes/added sunflower.png';
    expect(review.changes.find(item => item.path === addedImage)).toMatchObject({ kind: 'added', route: expect.arrayContaining(['t006 - embedded media.md']) });
    const replacement = fs.readFileSync(path.join(source, imagePath));
    expect(original.equals(replacement)).toBe(false);
    fs.writeFileSync(path.join(source, imagePath), 'changed after capture');
    expect(sourceSnapshotImage(bundle, state.acceptedId, imagePath).bytes).toEqual(original);
    expect(sourceSnapshotImage(bundle, candidateId, imagePath)).toEqual({ type: 'image/png', bytes: replacement });
    expect(sourceComparison(bundle, state.acceptedId, candidateId, addedImage, addedImage)).toMatchObject({ beforeImage: false, afterImage: true });
    expect(() => sourceSnapshotImage(bundle, state.acceptedId, addedImage)).toThrow(/not available/);
    expect(() => sourceSnapshotImage(bundle, 'f'.repeat(32), imagePath)).toThrow(/not available/);
    expect(() => sourceSnapshotImage(bundle, candidateId, '../private.png')).toThrow(/not available/);
    expect(() => sourceSnapshotImage(bundle, candidateId, 'main page.md')).toThrow(/not available/);
  }, 20000);

  it('stores scoped Git trees, shares blobs, and replaces candidates without changing HEAD or index', async () => {
    fs.writeFileSync(path.join(source, 'private-unreachable.md'), 'This must never be retained');
    const state = await initializeSourcing(bundle);
    const first = loadSourceSnapshot(bundle, state.acceptedId);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: temporary, encoding: 'utf8' }).trim();
    expect(first.files['private-unreachable.md']).toBeUndefined();
    expect(git('ls-tree', '-r', '--name-only', first.git!.commit)).not.toContain('private-unreachable.md');
    git('-c', 'user.name=Test', '-c', 'user.email=test@local', 'commit', '--allow-empty', '-m', 'User history');
    fs.writeFileSync(path.join(temporary, 'staged.txt'), 'user staging');
    git('add', 'staged.txt');
    const head = git('rev-parse', 'HEAD');
    const index = git('write-tree');
    change('rename-page-with-links');
    const pending = await scanSourceChanges(bundle);
    const candidate = loadSourceSnapshot(bundle, pending.candidate!.id);
    expect(git('rev-parse', `${first.git!.commit}:${oldName}`)).toBe(git('rev-parse', `${candidate.git!.commit}:${newName}`));
    expect(git('rev-parse', `${candidate.git!.commit}^`)).toBe(first.git!.commit);
    change('remove-incoming-link');
    const replacement = await scanSourceChanges(bundle, true);
    const replaced = loadSourceSnapshot(bundle, replacement.candidate!.id);
    expect(git('rev-parse', `${replaced.git!.commit}^`)).toBe(first.git!.commit);
    expect(git('rev-list', `${replaced.git!.branch}-candidate`)).not.toContain(candidate.git!.commit);
    expect(git('rev-parse', 'HEAD')).toBe(head);
    expect(git('write-tree')).toBe(index);
    await acceptAllMoves();
    git('reflog', 'expire', '--expire=now', '--all');
    git('gc', '--prune=now');
    expect(git('cat-file', '-t', first.git!.commit)).toBe('commit');
    expect(git('cat-file', '-t', replaced.git!.commit)).toBe('commit');
    expect(fs.existsSync(path.join(sourcingRoot(bundle), 'snapshots', first.id, 'source'))).toBe(false);
  }, 20000);

  it('migrates a legacy capture from its saved graph without retaining the wider library or reading live sources', async () => {
    const state = await initializeSourcing(bundle);
    const snapshot = loadSourceSnapshot(bundle, state.acceptedId);
    const legacyRoot = path.join(sourcingRoot(bundle), 'snapshots', snapshot.id, 'source');
    fs.cpSync(acceptedSourceRoot(bundle), legacyRoot, { recursive: true });
    fs.writeFileSync(path.join(legacyRoot, 'unrelated-private.md'), 'not part of this graph');
    snapshot.files['unrelated-private.md'] = { digest: 'a'.repeat(64), size: 22 };
    delete snapshot.git;
    delete state.storage;
    writeSourcingJson(path.join(sourcingRoot(bundle), 'snapshots', snapshot.id, 'snapshot.json'), snapshot);
    writeSourcingJson(path.join(sourcingRoot(bundle), 'state.json'), state);
    fs.renameSync(source, `${source}-offline`);
    const migrated = await initializeSourcing(bundle);
    const captured = loadSourceSnapshot(bundle, migrated.acceptedId);
    expect(captured.git?.commit).toBeDefined();
    expect(captured.files['unrelated-private.md']).toBeUndefined();
    expect(fs.existsSync(legacyRoot)).toBe(false);
    expect(fs.existsSync(path.join(acceptedSourceRoot(bundle), oldName))).toBe(true);
    expect(migrated.acceptedId).toBe(state.acceptedId);
  });

  it('keeps unrelated source edits out of snapshot updates and blocks live frontier on a real change or offline source', async () => {
    await initializeSourcing(bundle);
    fs.writeFileSync(path.join(source, 'unrelated-private.md'), 'Outside the working graph');
    expect((await scanSourceChanges(bundle)).candidate).toBeUndefined();
    const visible = await loadWorkingGraph({ bundleSlug: 'meadow-test-bundle-big', frontierDepth: 1 });
    expect(visible.frontierUnavailable).toBeUndefined();
    expect(visible.nodes.some(node => node.isFrontierNode)).toBe(true);
    change('rename-page-with-links');
    const stale = await loadWorkingGraph({ bundleSlug: 'meadow-test-bundle-big', frontierDepth: 1 });
    expect(stale.frontierUnavailable).toContain('waiting for review');
    expect(stale.nodes.some(node => node.isFrontierNode)).toBe(false);
    fs.renameSync(source, `${source}-offline`);
    const offline = await loadWorkingGraph({ bundleSlug: 'meadow-test-bundle-big', frontierDepth: 1 });
    expect(offline.frontierUnavailable).toContain('unavailable');
    expect(offline.nodes.length).toBeGreaterThan(0);
  });

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

  it('keeps only explicitly retained orphan entries and removes them on a later default acceptance', async () => {
    const review = await sourcingReview(bundle);
    const kept = review.orphans.find(item => !item.removalBlockedReason)!;
    const accepted = await acceptSourceSnapshot(bundle, { candidateId: review.accepted.id, reviewToken: review.reviewToken, resolutions: {}, orphanKeeps: [kept.bundleNodeId] });
    expect(accepted.orphans.map(item => item.bundleNodeId)).toEqual([kept.bundleNodeId]);
    expect(loadSourceNodeConfigs(bundle).some(item => item.bundleNodeId === kept.bundleNodeId)).toBe(true);
    const cleaned = await acceptSourceSnapshot(bundle, { candidateId: accepted.accepted.id, reviewToken: accepted.reviewToken, resolutions: {} });
    expect(cleaned.orphans).toHaveLength(0);
    expect(cleaned.history).toHaveLength(1);
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
    expect(pending.moves.find(move => move.bundleNodeId === node.bundleNodeId)).toMatchObject({ newPath: newName, confidence: 'strong', evidence: expect.arrayContaining(['Identical file contents']) });
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
    await acceptAllMoves();
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
    expect(orphan?.brokenConnection).toEqual({ from: 't003 - link to section.md', to: oldName });
    expect(orphan?.previousPath).toContain(oldName);
  });

  it('explains link removal without inventing a rename and retains tracking metadata outside config', async () => {
    await initializeSourcing(bundle);
    change('remove-incoming-link');
    const pending = await scanSourceChanges(bundle);
    expect(pending.moves).toHaveLength(0);
    const orphan = pending.orphans.find(item => item.path === 't001/deeper/t001 ---- child 2.md');
    const result = await acceptAllMoves();
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

  it('keeps an empty missing page orphaned and an empty replacement new', async () => {
    fs.writeFileSync(path.join(source, oldName), '');
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
    expect(accepted.trackingRequest?.nodeKeys).toContain(newName);
  });

  it('accepts the highest-ranked proposal when identical contents have more than one destination', async () => {
    await initializeSourcing(bundle);
    change('rename-page-with-links');
    fs.copyFileSync(path.join(source, newName), path.join(source, 'duplicate section.md'));
    fs.appendFileSync(path.join(source, 't003 - link to section.md'), '\n[[duplicate section]]');
    const pending = await scanSourceChanges(bundle);
    const matches = pending.moves.filter(move => move.oldPath === oldName);
    expect(matches).toHaveLength(2);
    expect(matches.every(move => move.competing)).toBe(true);
    const result = await acceptSourceSnapshot(bundle, { candidateId: pending.candidate!.id,
      reviewToken: pending.reviewToken, resolutions: {} });
    expect(result.candidate).toBeUndefined();
    expect(loadSourceNodeConfigs(bundle).find(node => node.bundleNodeId === matches[0].bundleNodeId)?.bundleNodeName).toBe(path.basename(matches[0].newPath, '.md'));
    expect(loadSourceNodeConfigs(bundle).some(node => nodeSourcePath(node) === 'duplicate section.md')).toBe(false);
  });

  it.each([
    { changeId: 'move-and-edit-page', oldPath: 't024 - markdown links.md', confidence: 'possible', evidence: 'blocks unchanged' },
    { changeId: 'move-tracked-image', oldPath: 't024/t024 ---- test image.png', confidence: 'strong', evidence: 'Identical file contents' },
  ])('matches $changeId through the shared Source Change', async ({ changeId, oldPath, confidence, evidence }) => {
    await initializeSourcing(bundle);
    change(changeId);
    const pending = await scanSourceChanges(bundle);
    const move = pending.moves.find(item => item.oldPath === oldPath);
    expect(move?.confidence).toBe(confidence);
    expect(move?.contentChanged).toBe(changeId === 'move-and-edit-page');
    expect(move?.evidence.some(item => item.includes(evidence))).toBe(true);
    await acceptAllMoves();
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
