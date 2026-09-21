/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BundleConfig } from '../../../../../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig, BundleNodeId } from '../../../../../../contracts/types/bundleNodeConfig.js';
import { materializeSourceGraph } from '../../../../../../shared_code/shared_dev/sourceChanges.js';
import { applyNodeConfigsToNodes, stringifyBundleNodeConfig } from '../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { getFolderBundleRepairStatus } from '../../../../src/shared/bundle-config/folderBundleRepair.js';
import { createMultiSourceBundle } from '../../../../src/areas/bundles/services/multiSourceBundleCreation.js';
import { bundleStartingSelections } from '../../../../../../shared_code/utils/startingSelectionUtils.js';
import { loadSourceBundleConfig, loadSourceNodeConfigs } from '../../../../src/shared/source-snapshot/sourceSnapshots.js';
import { trackBundleNodes } from '../../../../src/areas/bundle/curation/services/bundleTrackingOperations.js';
import { loadWorkingGraph } from '../../../../src/shared/bundle-graph/workingGraphService.js';
import { captureSourceSnapshot, initializeSourcing, loadSourceSnapshot, loadSourcingState, snapshotGraph, snapshotSourceRoot, sourceConfigFingerprint } from '../../../../src/shared/source-snapshot/sourceSnapshots.js';
import { stageSourceRegistry, cancelSourceCandidate, setIgnoredSource } from '../../../../src/areas/bundle/sourcing/services/sourceRegistryReview.js';
import { acceptSourceSnapshot, sourcingReview, scanSourceChanges } from '../../../../src/areas/bundle/sourcing/services/sourceReview.js';

vi.mock('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js', async importOriginal => ({ ...await importOriginal<typeof import('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js')>(), commitChangesNative: vi.fn(async () => undefined) }));
const projectRoot = fileURLToPath(new URL('../../../../../../../', import.meta.url));
let temporary: string;
let bundle: string;
let source: string;
let config: BundleConfig;
let nodes: BundleNodeConfig[];
let priorHome: string | undefined;

beforeEach(() => {
  temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-multi-source-snapshots-')));
  priorHome = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = temporary;
  source = materializeSourceGraph({ projectRoot, sourceGraphsDir: path.join(temporary, 'source_graphs'), sourceGraph: 'multi-source' });
  bundle = path.join(temporary, 'bundles/multi-source');
  fs.cpSync(path.join(projectRoot, 'app/shared_data/home_fixtures/home_fixture_big_and_small/bundles/meadow-test-bundle-big/config'), path.join(bundle, 'config'), { recursive: true });
  const legacy = YAML.parse(fs.readFileSync(path.join(bundle, 'config/bundle_config.yaml'), 'utf8')) as BundleConfig;
  delete legacy.sourceDirectory;
  config = { ...legacy, sources: [
    { id: 'source000001', name: 'notes', directory: path.join(source, 'notes') },
    { id: 'source000002', name: 'research', aliases: ['papers'], directory: path.join(source, 'research') },
  ], entryBundleNodeId: 'start0000001' as BundleNodeId, defaultTraversalBundleNodeId: 'start0000001' as BundleNodeId,
  defaultOutlinksDepth: 2, defaultInlinksDepth: 1, sourceOutputLayout: 'multi' };
  nodes = [{ sourceId: 'source000001', bundleNodeName: 'Start', sourceGraphSubdirectory: '', bundleNodeKind: 'file', fileType: 'md', bundleNodeId: config.entryBundleNodeId!, listType: 'whitelist' }];
  fs.writeFileSync(path.join(bundle, 'config/bundle_config.yaml'), YAML.stringify(config));
  fs.writeFileSync(path.join(bundle, 'config/bundle_node_config.yaml'), stringifyBundleNodeConfig(nodes));
});

afterEach(({ task }) => {
  if (priorHome === undefined) delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  else process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = priorHome;
  if (task.result?.state === 'fail') console.error(`Multi-source snapshot home retained at ${temporary}`);
  else fs.rmSync(temporary, { recursive: true, force: true });
});

describe('multi-source snapshots with the shared fixture', () => {
  it('captures distinct source paths and preserves accepted curation when a source disconnects', async () => {
    const state = await initializeSourcing(bundle);
    const snapshot = loadSourceSnapshot(bundle, state.acceptedId);
    expect(snapshot.sources).toEqual(config.sources);
    expect(snapshot.fileCount).toBe(10);
    expect(snapshot.files['_mw_sources/source000001/Overview.md']).toBeDefined();
    expect(snapshot.files['_mw_sources/source000002/Overview.md']).toBeDefined();
    expect(snapshot.files['_mw_sources/source000001/Unrelated.md']).toBeUndefined();
    const before = await loadWorkingGraph({ bundleSlug: 'multi-source' });
    expect(before.nodes.find(node => node.bundleNodeName === 'Start')?.bundleNodeId).toBe('start0000001');
    expect(before.nodes.filter(node => node.bundleNodeName === 'Overview').map(node => node.sourceId).sort()).toEqual(['source000001', 'source000002']);
    const fingerprint = sourceConfigFingerprint(bundle);
    fs.renameSync(path.join(source, 'research'), path.join(source, 'research-disconnected'));
    await expect(scanSourceChanges(bundle, true)).rejects.toThrow(/research.*disconnected/);
    expect(loadSourcingState(bundle)?.acceptedId).toBe(state.acceptedId);
    expect(sourceConfigFingerprint(bundle)).toBe(fingerprint);
    const offline = await loadWorkingGraph({ bundleSlug: 'multi-source' });
    expect(offline.nodes.map(node => node.bundleNodeKey)).toEqual(before.nodes.map(node => node.bundleNodeKey));
    expect(fs.readFileSync(path.join(snapshotSourceRoot(bundle, snapshot.id), '_mw_sources/source000002/Overview.md'), 'utf8')).toContain('Research overview');
    fs.renameSync(path.join(source, 'research-disconnected'), path.join(source, 'research'));
    expect((await scanSourceChanges(bundle, true)).candidate).toBeUndefined();
  });

  it('keeps candidate registry names and bytes separate from accepted configuration and live locations', async () => {
    const accepted = await initializeSourcing(bundle);
    const fingerprint = sourceConfigFingerprint(bundle);
    const originalBytes = fs.readFileSync(path.join(source, 'research/Overview.md'));
    const renamed: BundleConfig = { ...config, sources: config.sources!.map(item => item.name === 'research'
      ? { ...item, name: 'library', aliases: ['papers', 'research'] } : item) };
    const captured = await captureSourceSnapshot(bundle, { context: { config: renamed, nodes } });
    expect(captured.sources?.[1].name).toBe('library');
    expect(captured.digest).not.toBe(loadSourceSnapshot(bundle, accepted.acceptedId).digest);
    expect(sourceConfigFingerprint(bundle)).toBe(fingerprint);
    expect(loadSourcingState(bundle)?.acceptedId).toBe(accepted.acceptedId);
    fs.renameSync(path.join(source, 'research'), path.join(source, 'relocated-research'));
    const historical = await snapshotGraph(bundle, captured, nodes, 0);
    expect(historical.nodes.find(node => node.bundleNodeKey === '_mw_sources/source000002/Overview.md')).toMatchObject({ sourceId: 'source000002', sourceGraphSubdirectory: '' });
    expect(historical.allLinkResolutionMaps['_mw_sources/source000001/Start.md']['Overview::papers|research overview'].link_resolved_target_path).toBe('_mw_sources/source000002/Overview.md');
    expect(fs.readFileSync(path.join(source, 'relocated-research/Overview.md'))).toEqual(originalBytes);
    expect(sourceConfigFingerprint(bundle)).toBe(fingerprint);
  });
});


describe('registry review acceptance', () => {
  const registry = () => YAML.parse(fs.readFileSync(path.join(bundle, 'config/bundle_config.yaml'), 'utf8')) as BundleConfig;
  const accept = async () => {
    const review = await sourcingReview(bundle);
    return acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {}, trackNewPages: false });
  };

  it('stages rename aliases, preserves IDs and authored bytes, then atomically accepts', async () => {
    const state = await initializeSourcing(bundle);
    const original = fs.readFileSync(path.join(source, 'notes/Start.md'));
    await stageSourceRegistry(bundle, config.sources!.map(item => item.name === 'research' ? { ...item, name: 'library' } : item));
    expect(registry().sources?.[1].name).toBe('research');
    expect(loadSourcingState(bundle)?.acceptedId).toBe(state.acceptedId);
    const review = await sourcingReview(bundle);
    expect(review.sourceChanges).toMatchObject({ outputPathsChange: true, stale: false });
    expect(review.changes).toEqual([]);
    expect(review.moves).toEqual([]);
    await accept();
    expect(registry().sources?.[1]).toMatchObject({ id: 'source000002', name: 'library', aliases: ['papers', 'research'] });
    expect(loadSourcingState(bundle)?.candidateId).toBeUndefined();
    const graph = await loadWorkingGraph({ bundleSlug: 'multi-source' });
    expect(graph.nodes.find(node => node.bundleNodeName === 'Start')?.bundleNodeId).toBe('start0000001');
    expect(fs.readFileSync(path.join(source, 'notes/Start.md'))).toEqual(original);
    const historical = await snapshotGraph(bundle, loadSourceSnapshot(bundle, state.acceptedId), nodes, 0);
    expect(historical.nodes.filter(node => node.bundleNodeName === 'Overview')).toHaveLength(2);
  });

  it('preserves the accepted configuration and previous candidate through failed and cancelled proposals', async () => {
    const accepted = await initializeSourcing(bundle);
    const fingerprint = sourceConfigFingerprint(bundle);
    await stageSourceRegistry(bundle, [...config.sources!, { id: 'source000003', name: 'reference', directory: path.join(source, 'reference') }]);
    const candidate = loadSourcingState(bundle)?.candidateId;
    await expect(stageSourceRegistry(bundle, [...config.sources!, { id: 'source000003', name: 'reference', directory: path.join(source, 'missing') }])).rejects.toThrow(/disconnected/);
    expect(loadSourcingState(bundle)?.candidateId).toBe(candidate);
    await expect(stageSourceRegistry(bundle, [...config.sources!, { id: 'source000003', name: 'papers', directory: path.join(source, 'reference') }])).rejects.toThrow(/already registered/);
    await expect(stageSourceRegistry(bundle, [...config.sources!, { id: 'source000003', name: 'reference', directory: path.join(source, 'notes/Same') }])).rejects.toThrow(/overlap/);
    await cancelSourceCandidate(bundle);
    expect(loadSourcingState(bundle)?.candidateId).toBeUndefined();
    expect(loadSourcingState(bundle)?.acceptedId).toBe(accepted.acceptedId);
    expect(sourceConfigFingerprint(bundle)).toBe(fingerprint);
  });

  it('requires a fresh capture after curation changes and keeps ignored names bundle-local', async () => {
    await initializeSourcing(bundle);
    const proposed = [...config.sources!, { id: 'source000003', name: 'reference', directory: path.join(source, 'reference') }];
    await stageSourceRegistry(bundle, proposed);
    await setIgnoredSource(bundle, 'unrelated', true);
    const stale = await sourcingReview(bundle);
    expect(stale.sourceChanges?.stale).toBe(true);
    await expect(accept()).rejects.toThrow(/stale/);
    expect(registry().sources).toHaveLength(2);
    await scanSourceChanges(bundle, true);
    expect((await sourcingReview(bundle)).sourceChanges?.stale).toBe(false);
    await accept();
    expect(registry().sources).toHaveLength(3);
    expect(registry().ignoredSourceNames).toEqual(['unrelated']);
    await setIgnoredSource(bundle, 'unrelated', false);
    expect(registry().ignoredSourceNames).toEqual([]);
  });

  it('migrates a legacy source without reclassifying unchanged pages or changing their IDs', async () => {
    config.generationOpenKnowledgeFormatIndexSourcePath = 'Start.md';
    const { sources: _sources, sourceOutputLayout: _layout, ...legacy } = config;
    fs.writeFileSync(path.join(bundle, 'config/bundle_config.yaml'), YAML.stringify({ ...legacy, sourceDirectory: path.join(source, 'notes') }));
    fs.writeFileSync(path.join(bundle, 'config/bundle_node_config.yaml'), stringifyBundleNodeConfig(nodes.map(({ sourceId: _id, ...node }) => node as BundleNodeConfig)));
    const accepted = await initializeSourcing(bundle);
    await stageSourceRegistry(bundle, config.sources!);
    const review = await sourcingReview(bundle);
    expect(review.changes.filter(change => change.kind === 'missing')).toEqual([]);
    expect(review.changes.filter(change => change.kind === 'added').every(change => change.path.startsWith('_mw_sources/source000002/'))).toBe(true);
    expect(review.moves).toEqual([]);
    expect(review.orphans).toEqual([]);
    await accept();
    expect(registry().sourceDirectory).toBeUndefined();
    expect(registry().sourceOutputLayout).toBe('multi');
    expect(registry().generationOpenKnowledgeFormatIndexSourcePath).toBe('_mw_sources/source000001/Start.md');
    const graph = await loadWorkingGraph({ bundleSlug: 'multi-source' });
    expect(graph.nodes.find(node => node.bundleNodeName === 'Start')?.bundleNodeId).toBe('start0000001');
    expect((await snapshotGraph(bundle, loadSourceSnapshot(bundle, accepted.acceptedId), undefined, 0)).nodes.some(node => node.bundleNodeKey === 'Start.md')).toBe(true);
  });

  it('reviews removed-source orphans and retains the adopted output layout', async () => {
    nodes.push({ sourceId: 'source000002', bundleNodeName: 'Overview', sourceGraphSubdirectory: '', bundleNodeKind: 'file', fileType: 'md', bundleNodeId: 'research0001' as BundleNodeId, listType: 'whitelist' });
    fs.writeFileSync(path.join(bundle, 'config/bundle_node_config.yaml'), stringifyBundleNodeConfig(nodes));
    await initializeSourcing(bundle);
    fs.renameSync(path.join(source, 'research'), path.join(source, 'disconnected'));
    await stageSourceRegistry(bundle, [config.sources![0]]);
    const review = await sourcingReview(bundle);
    expect(review.orphans.find(orphan => orphan.bundleNodeId === 'research0001')).toMatchObject({ reason: 'This source is being removed from the bundle. Its files are untouched.' });
    await accept();
    expect(registry().sourceOutputLayout).toBe('multi');
    expect(fs.readFileSync(path.join(bundle, 'config/bundle_node_config.yaml'), 'utf8')).not.toContain('research0001');
    expect(fs.existsSync(path.join(source, 'disconnected/Overview.md'))).toBe(true);
    await expect(stageSourceRegistry(bundle, [config.sources![1]])).rejects.toThrow(/required starting selection/);
  });
});


it('tracks duplicate relative files separately and keeps curation available while disconnected', async () => {
  await initializeSourcing(bundle);
  const result = await trackBundleNodes('multi-source', { mode: 'safe-targeted', nodeKeys: ['_mw_sources/source000001/Overview.md', '_mw_sources/source000002/Overview.md'] });
  expect(result.newlyTracked).toHaveLength(2);
  const tracked = path.join(bundle, 'raw/tracked_page_content/_mw_sources');
  expect(fs.readFileSync(path.join(tracked, 'source000001/Overview.md'), 'utf8')).toContain('Notebook overview');
  expect(fs.readFileSync(path.join(tracked, 'source000002/Overview.md'), 'utf8')).toContain('Research overview');
  const graph = await loadWorkingGraph({ bundleSlug: 'multi-source' });
  applyNodeConfigsToNodes(graph.nodes, graph.committedNodes);
  expect(new Set(graph.nodes.filter(node => node.bundleNodeName === 'Overview').map(node => node.bundleNodeId)).size).toBe(2);
  fs.renameSync(path.join(source, 'research'), path.join(source, 'offline'));
  const offline = await trackBundleNodes('multi-source', { mode: 'safe-targeted', nodeKeys: ['_mw_sources/source000002/Same/Inside.md'] });
  expect(offline.newlyTracked).toHaveLength(1);
});


it('adds a mixed starting selection without replacing the original page, including candidate refresh', async () => {
  await initializeSourcing(bundle);
  await stageSourceRegistry(bundle, config.sources!, [
    { sourceId: 'source000001', kind: 'file', path: 'Start.md' },
    { sourceId: 'source000002', kind: 'folder', path: 'Same' },
  ]);
  const first = loadSourceSnapshot(bundle, loadSourcingState(bundle)!.candidateId!);
  const collection = first.sourceProposal!.nodes.find(node => node.bundleNodeKind === 'collection')!;
  expect(collection.bundleNodeKind === 'collection' && collection.memberBundleNodeIds[0]).toBe('start0000001');
  expect(loadSourceBundleConfig(bundle).entryBundleNodeId).toBe('start0000001');
  await setIgnoredSource(bundle, 'unrelated', true);
  await scanSourceChanges(bundle, true);
  const refreshed = loadSourceSnapshot(bundle, loadSourcingState(bundle)!.candidateId!);
  expect(refreshed.sourceProposal!.entryBundleNodeId).toBe(collection.bundleNodeId);
  expect(refreshed.sourceProposal!.nodes.map(node => node.bundleNodeId)).toEqual(first.sourceProposal!.nodes.map(node => node.bundleNodeId));
  const review = await sourcingReview(bundle);
  await acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {}, trackNewPages: false });
  const graph = await loadWorkingGraph({ bundleSlug: 'multi-source' });
  const start = graph.nodes.find(node => node.bundleNodeName === 'Start')!;
  expect(start.bundleNodeId).toBe('start0000001');
  expect(start.remaining_depth).toBe(2);
  expect(graph.edges.some(edge => edge.bundleEdgeKind === 'collectionMembership' && edge.target === start.bundleNodeKey)).toBe(true);
  expect(graph.nodes.find(node => node.bundleNodeKey === '_mw_sources/source000002/Same/Inside.md')?.remaining_depth).toBe(2);
  expect(bundleStartingSelections(loadSourceBundleConfig(bundle), loadSourceNodeConfigs(bundle))).toEqual([
    { sourceId: 'source000001', kind: 'file', path: 'Start.md' },
    { sourceId: 'source000002', kind: 'folder', path: 'Same' },
  ]);
});

it('creates a mixed multi-source bundle with one initial accepted snapshot and only its selections configured', async () => {
  const slug = await createMultiSourceBundle({ slug: 'created-multi-source', bundleName: 'Multi-source collection', sources: config.sources!,
    startingSelections: [{ sourceId: 'source000001', kind: 'file', path: 'Start.md' }, { sourceId: 'source000002', kind: 'folder', path: 'Same' }],
    defaultOutlinksDepth: 0, defaultInlinksDepth: 0 });
  const directory = path.join(temporary, 'bundles', slug);
  const state = loadSourcingState(directory)!;
  expect(state.history).toHaveLength(1);
  expect(state.candidateId).toBeUndefined();
  expect(loadSourceNodeConfigs(directory)).toHaveLength(3);
  const graph = await loadWorkingGraph({ bundleSlug: slug });
  expect(graph.nodes.some(node => node.bundleNodeKey === '_mw_sources/source000002/Same/Inside.md')).toBe(true);
  expect(loadSourceBundleConfig(directory).sourceOutputLayout).toBe('multi');
  expect(getFolderBundleRepairStatus(directory)).toMatchObject({ folderDerived: true, repairRequired: false });
});


it('matches a reachable cross-source move while preserving the page identity and overrides', async () => {
  config.sources!.push({ id: 'source000003', name: 'reference', directory: path.join(source, 'reference') });
  nodes.push({ sourceId: 'source000002', bundleNodeName: 'Overview', sourceGraphSubdirectory: '', bundleNodeKind: 'file', fileType: 'md', bundleNodeId: 'research0001' as BundleNodeId, listType: 'whitelist', outlinksDepth: 4, inlinksDepth: 0 });
  fs.writeFileSync(path.join(bundle, 'config/bundle_config.yaml'), YAML.stringify(config));
  fs.writeFileSync(path.join(bundle, 'config/bundle_node_config.yaml'), stringifyBundleNodeConfig(nodes));
  await initializeSourcing(bundle);
  fs.renameSync(path.join(source, 'research/Overview.md'), path.join(source, 'reference/Transferred.md'));
  fs.appendFileSync(path.join(source, 'notes/Start.md'), '\n[[Transferred::reference]]\n');
  const review = await scanSourceChanges(bundle, true);
  expect(review.moves.filter(move => move.bundleNodeId === 'research0001')).toMatchObject([{ oldPath: '_mw_sources/source000002/Overview.md', newPath: '_mw_sources/source000003/Transferred.md', competing: false, confidence: 'strong' }]);
  await acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {}, trackNewPages: false });
  expect(loadSourceNodeConfigs(bundle).find(node => node.bundleNodeId === 'research0001')).toMatchObject({ sourceId: 'source000003', bundleNodeName: 'Transferred', outlinksDepth: 4, inlinksDepth: 0 });
});

it('retains ambiguity for competing cross-source moves and allows them to remain separate pages', async () => {
  config.sources!.push({ id: 'source000003', name: 'reference', directory: path.join(source, 'reference') });
  nodes.push({ sourceId: 'source000002', bundleNodeName: 'Overview', sourceGraphSubdirectory: '', bundleNodeKind: 'file', fileType: 'md', bundleNodeId: 'research0001' as BundleNodeId, listType: 'whitelist' });
  fs.writeFileSync(path.join(bundle, 'config/bundle_config.yaml'), YAML.stringify(config));
  fs.writeFileSync(path.join(bundle, 'config/bundle_node_config.yaml'), stringifyBundleNodeConfig(nodes));
  await initializeSourcing(bundle);
  fs.renameSync(path.join(source, 'research/Overview.md'), path.join(source, 'reference/Transferred.md'));
  fs.cpSync(path.join(source, 'reference/Transferred.md'), path.join(source, 'notes/Copy.md'));
  fs.appendFileSync(path.join(source, 'notes/Start.md'), '\n[[Transferred::reference]] [[Copy]]\n');
  const review = await scanSourceChanges(bundle, true);
  const matches = review.moves.filter(move => move.bundleNodeId === 'research0001');
  expect(matches).toHaveLength(2);
  expect(matches.every(move => move.competing)).toBe(true);
  await acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: { research0001: null }, trackNewPages: false });
  expect(loadSourceNodeConfigs(bundle).some(node => node.bundleNodeId === 'research0001')).toBe(false);
});

it('does not match a moved file outside the reachable graph', async () => {
  nodes.push({ sourceId: 'source000002', bundleNodeName: 'Incoming', sourceGraphSubdirectory: '', bundleNodeKind: 'file', fileType: 'md', bundleNodeId: 'research0001' as BundleNodeId, listType: 'whitelist' });
  fs.writeFileSync(path.join(bundle, 'config/bundle_node_config.yaml'), stringifyBundleNodeConfig(nodes));
  await initializeSourcing(bundle);
  // This destination is neither registered nor reachable, although its bytes are identical.
  fs.renameSync(path.join(source, 'research/Incoming.md'), path.join(source, 'reference/Incoming.md'));
  const review = await scanSourceChanges(bundle, true);
  expect(review.moves).toEqual([]);
  expect(review.orphans.some(orphan => orphan.bundleNodeId === 'research0001')).toBe(true);
});

it('keeps a separate default traversal start when refreshing a registry-only proposal', async () => {
  nodes.push({ sourceId: 'source000002', bundleNodeName: 'Overview', sourceGraphSubdirectory: '', bundleNodeKind: 'file', fileType: 'md', bundleNodeId: 'research0001' as BundleNodeId, listType: 'whitelist' });
  config.defaultTraversalBundleNodeId = 'research0001' as BundleNodeId;
  fs.writeFileSync(path.join(bundle, 'config/bundle_config.yaml'), YAML.stringify(config));
  fs.writeFileSync(path.join(bundle, 'config/bundle_node_config.yaml'), stringifyBundleNodeConfig(nodes));
  await initializeSourcing(bundle);
  await stageSourceRegistry(bundle, config.sources!.map(source => source.id === 'source000002' ? { ...source, name: 'library' } : source));
  await setIgnoredSource(bundle, 'unrelated', true);
  const review = await scanSourceChanges(bundle, true);
  await acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {}, trackNewPages: false });
  expect(loadSourceBundleConfig(bundle).entryBundleNodeId).toBe('start0000001');
  expect(loadSourceBundleConfig(bundle).defaultTraversalBundleNodeId).toBe('research0001');
});
