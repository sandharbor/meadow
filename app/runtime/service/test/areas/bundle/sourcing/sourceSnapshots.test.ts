/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { scanWithTrackingAssessment } from '../../../../src/areas/bundle/sourcing/services/reviewWithTrackingAssessment.js';
import { sourceCurationWorkflow } from '../../../../src/shared/app-shell/sourceCurationWorkflow.js';
import { trackSnapshotAdditions } from '../../../../src/areas/bundle/curation/services/snapshotTracking.js';
import { loadWorkingGraph } from '../../../../src/shared/bundle-graph/workingGraphService.js';
import path from 'node:path';
import YAML from 'yaml';
import { describe, expect, it, vi } from 'vitest';
import { acceptSourceSnapshot, scanSourceChanges, sourcingReview, sourceComparison, sourceSnapshotImage, sourceSnapshotHistory } from '../../../../src/areas/bundle/sourcing/services/sourceReview.js';
import { acceptedSourceRoot, initializeSourcing, loadSourceNodeConfigs, loadSourceSnapshot, loadSourcingState, sourcingRoot, writeSourcingJson } from '../../../../src/shared/source-snapshot/sourceSnapshots.js';
import { loadTrackingRecords } from '../../../../src/shared/bundle-node/trackingRecords.js';
import { sourceFilePathToBundleNodeKey } from '../../../../src/shared/bundle-node/nodeKeys.js';
import { sourceTraversalGraph } from '../../../../src/areas/bundle/sourcing/services/sourceTraversalGraph.js';
import { acceptAllMoves, changeSource, newName, oldName, useBigGraphSnapshotHome } from './bigGraphSnapshotHome.js';

vi.mock('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js', async importOriginal => ({ ...await importOriginal<typeof import('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js')>(), commitChangesNative: vi.fn(async () => undefined) }));
let temporary: string;
let bundle: string;
let source: string;
useBigGraphSnapshotHome(home => ({ temporary, bundle, source } = home));
function change(changeId: string) { return changeSource(source, changeId); }

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
    expect(route).toEqual(['Start.md', 'Bridge.md', 'Hub.md', 'Incoming.md'].map(sourceFilePathToBundleNodeKey));
    const graph = pending.traversalGraphs!.candidate!;
    expect(graph.snapshotId).toBe(pending.candidate!.id);
    expect(graph.nodes.map(node => node.bundleNodeKey).sort()).toEqual([...route!].sort());
    expect(graph.nodes.find(node => node.bundleNodeKey === sourceFilePathToBundleNodeKey('Incoming.md'))).toMatchObject({
      path: route, remaining_depth: 1, remaining_inlinks_depth: 0, traversal_details: { link_type: 'inlink' },
      traversal_path_steps: [
        { bundleNodeKey: sourceFilePathToBundleNodeKey('Start.md'), depth: 0, remaining_depth: 3, remaining_inlinks_depth: 1, traversal_details: { link_type: 'start' } },
        { bundleNodeKey: sourceFilePathToBundleNodeKey('Bridge.md'), depth: 1, remaining_depth: 3, remaining_inlinks_depth: 2, traversal_details: { link_type: 'outlink' } },
        { bundleNodeKey: sourceFilePathToBundleNodeKey('Hub.md'), depth: 2, remaining_depth: 2, remaining_inlinks_depth: 1, traversal_details: { link_type: 'outlink' } },
        { bundleNodeKey: sourceFilePathToBundleNodeKey('Incoming.md'), depth: 3, remaining_depth: 1, remaining_inlinks_depth: 0, traversal_details: { link_type: 'inlink' } },
      ],
    });
    const hub = graph.nodes.find(node => node.bundleNodeKey === sourceFilePathToBundleNodeKey('Hub.md'))!;
    expect(hub.path).toEqual(['Start.md', 'Hub.md'].map(sourceFilePathToBundleNodeKey));
    expect(hub.traversal_alternative_routes?.[0].map(step => step.bundleNodeKey)).toEqual(['Start.md', 'Bridge.md', 'Hub.md'].map(sourceFilePathToBundleNodeKey));
    expect(hub.traversal_alternative_routes?.[0].at(-1)?.remaining_inlinks_depth).toBe(1);
    // A review of Hub alone still includes the page that explains its alternative arrival.
    const hubReview = sourceTraversalGraph(pending.candidate!.id,
      loadSourceSnapshot(bundle, pending.candidate!.id).graph, [['Start.md', 'Hub.md'].map(sourceFilePathToBundleNodeKey)]);
    expect(hubReview!.nodes.map(node => node.bundleNodeKey).sort()).toEqual(['Bridge.md', 'Hub.md', 'Start.md'].map(sourceFilePathToBundleNodeKey));
    expect(graph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ source: sourceFilePathToBundleNodeKey('Incoming.md'), target: sourceFilePathToBundleNodeKey('Hub.md') })]));
    expect(pending.traversalGraphs!.accepted!.snapshotId).toBe(state.acceptedId);
    expect(pending.traversalGraphs!.accepted!.nodes.some(node => node.bundleNodeKey === sourceFilePathToBundleNodeKey('Incoming.md'))).toBe(false);
    expect(loadSourceSnapshot(bundle, state.acceptedId).files['Incoming.md']).toBeUndefined();
    expect(loadSourcingState(bundle)!.acceptedId).toBe(state.acceptedId);
  });

  it.each([true, false])('leaves reviewed additions untracked despite the legacy preference %s', async trackNewPages => {
    await initializeSourcing(bundle);
    const initialConfigs = loadSourceNodeConfigs(bundle);
    change('add-linked-page');
    let review = await scanSourceChanges(bundle);
    expect(review.trackNewPages).toBeUndefined();
    const accepted = await acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {}, trackNewPages });
    expect(accepted.trackingRequest).toBeUndefined();
    const removedIds = new Set(review.orphans.filter(orphan => !orphan.removalBlockedReason).map(orphan => orphan.bundleNodeId));
    expect(loadSourceNodeConfigs(bundle)).toEqual(initialConfigs.filter(node => !removedIds.has(node.bundleNodeId)));
    expect(fs.existsSync(path.join(acceptedSourceRoot(bundle), 'source-changes/added field notes.md'))).toBe(true);
    change('add-embedded-image');
    review = await scanSourceChanges(bundle);
    expect(review.trackNewPages).toBeUndefined();
    const next = await acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {} });
    expect(next.trackingRequest).toBeUndefined();
    expect(loadSourceNodeConfigs(bundle).some(node => node.bundleNodeName === 'added sunflower')).toBe(false);
  }, 20000);

  it.each(['direct', 'filter', 'global', 'disabled-global', 'disabled-filter'])('explicit curation bulk tracking respects %s sensitivity', async mode => {
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
    expect(accepted.trackingOutcome).toBeUndefined();
    const outcome = await trackSnapshotAdditions(bundle, { snapshotId: review.candidate!.id, nodeKeys: [...privateKeys, 'source-changes/added public update.md'].map(sourceFilePathToBundleNodeKey) });
    expect(outcome.trackedNodeKeys).toEqual([...(shouldSkip ? [] : privateKeys), 'source-changes/added public update.md'].map(sourceFilePathToBundleNodeKey));
    expect(outcome.sensitiveSkipped.map(node => node.bundleNodeKey)).toEqual(shouldSkip ? privateKeys.map(sourceFilePathToBundleNodeKey) : []);
    const added = loadSourceNodeConfigs(bundle).filter(node => node.bundleNodeName.startsWith('added '));
    expect(added.map(node => node.bundleNodeName)).toEqual([...(shouldSkip ? [] : ['added confidential notes', 'added confidential planning']), 'added public update']);
    expect(loadTrackingRecords(bundle)[added.find(node => node.bundleNodeName === 'added public update')!.bundleNodeId].lastReachable?.path).toBe('source-changes/added public update.md');
    for (const key of privateKeys) expect(fs.existsSync(path.join(acceptedSourceRoot(bundle), key))).toBe(true);
    await expect(trackSnapshotAdditions(bundle, { snapshotId: 'outdated', nodeKeys: privateKeys.map(sourceFilePathToBundleNodeKey) })).rejects.toThrow(/snapshot changed/);
  }, 20000);

  it('assesses and accepts a new drawing through its graph key rather than its stored filename', async () => {
    await initializeSourcing(bundle);
    const filename = 'source-changes/added confidential drawing.excalidraw.md';
    fs.mkdirSync(path.join(source, 'source-changes'), { recursive: true });
    fs.copyFileSync(path.join(source, 't006/t006 --- meadow-flower.excalidraw.md'), path.join(source, filename));
    fs.appendFileSync(path.join(source, 'main page.md'), '\n[[source-changes/added confidential drawing.excalidraw]]\n');
    fs.writeFileSync(path.join(bundle, 'config/custom_filters.json'), JSON.stringify({ version: '1.0.0', filters: [{
      id: 'confidential', name: 'Confidential', scope: 'bundle', enabled: true,
      selectors: [{ field: 'title', matchType: 'substring', value: 'confidential' }],
      selectorApplicationCriteria: 'union', actions: [{ type: 'mark_sensitive' }],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }] }));
    const review = await scanWithTrackingAssessment(bundle, false, false);
    expect(review.changes.find(change => change.path === filename)).toMatchObject({ kind: 'added' });
    expect(review.trackingSensitivity).toEqual({ [filename]: 'filter' });
    const accepted = await sourceCurationWorkflow.accept(bundle, {
      candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {}, trackNewPages: true,
    });
    expect(accepted.trackingOutcome?.error).toBeUndefined();
    expect(accepted.trackingOutcome).toBeUndefined();
    expect(loadSourceNodeConfigs(bundle).some(node => node.bundleNodeName === 'added confidential drawing')).toBe(false);
    expect(fs.existsSync(path.join(acceptedSourceRoot(bundle), filename))).toBe(true);
  }, 20000);

  it('keeps sources accepted and additions untracked when curation cannot evaluate its filters', async () => {
    await initializeSourcing(bundle);
    change('add-linked-page');
    const review = await scanWithTrackingAssessment(bundle, false, false);
    // Simulate a filter document becoming invalid after the user reviewed sources.
    fs.writeFileSync(path.join(bundle, 'config/custom_filters.json'), '{malformed');
    const accepted = await sourceCurationWorkflow.accept(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {} });
    expect(accepted.trackingOutcome).toBeUndefined();
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
    expect(accepted.trackingOutcome).toBeUndefined();
    const outcome = await trackSnapshotAdditions(bundle, { snapshotId: review.candidate!.id, nodeKeys: ['source-changes/added confidential notes.md', 'source-changes/added confidential planning.md', 'source-changes/added public update.md'].map(sourceFilePathToBundleNodeKey) });
    expect(outcome.sensitiveSkipped).toHaveLength(2);
    expect(outcome.trackedNodeKeys).toEqual(['source-changes/added public update.md'].map(sourceFilePathToBundleNodeKey));
  }, 20000);

  it('reads only accepted history without capturing sources or including a pending candidate', async () => {
    expect(sourceSnapshotHistory(bundle)).toEqual({ acceptedId: null, snapshots: [] });
    expect(loadSourcingState(bundle)).toBeNull();
    const initial = await initializeSourcing(bundle);
    change('rename-page-with-links');
    const pending = await scanSourceChanges(bundle);
    expect(sourceSnapshotHistory(bundle)).toEqual({ acceptedId: initial.acceptedId, snapshots: initial.history });
    expect(sourceSnapshotHistory(bundle).snapshots.some(item => item.id === pending.candidate!.id)).toBe(false);
    await acceptAllMoves(bundle);
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
    expect(review.changes.find(item => item.path === 'source-changes/added field notes.md')).toMatchObject({ kind: 'added', route: expect.arrayContaining(['main page.md'].map(sourceFilePathToBundleNodeKey)) });
    const addedImage = 'source-changes/added sunflower.png';
    expect(review.changes.find(item => item.path === addedImage)).toMatchObject({ kind: 'added', route: expect.arrayContaining(['t006 - embedded media.md'].map(sourceFilePathToBundleNodeKey)) });
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
    await acceptAllMoves(bundle);
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
});
