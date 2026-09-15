/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { loadTrackingRecords, saveTrackingRecords, separateTrackingEvidence } from '../bundle-node/trackingRecords.js';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import YAML from 'yaml';
import { loadAppConfig } from '../../../../../shared_code/utils/appConfigUtils.js';
import { commitChangesNative } from '../utils/configDirectory/gitUtils/gitStatusUtils.js';
import { getConfigDirectory } from '../bundle-config/bundleConfigPaths.js';
import type { BundleConfig } from '../../../../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig } from '../../../../../contracts/types/bundleNodeConfig.js';
import type { SourceSnapshotSummary } from '../../../../../contracts/types/sourcing.js';
import { parseBundleNodeConfig, stringifyBundleNodeConfig } from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { textDocumentCodec, writeDurableDocument } from '../../../../../shared_code/utils/durableDocument.js';
import { runWorkingGraphJson, invalidateWorkingGraphCache } from '../utils/workingGraphUtils.js';
import type { WorkingGraphRustOutput } from '../bundle-graph/workingGraphService.js';
import { scopeSourceSnapshot, sourceInventory, forgetLiveSourceLinks, rememberLiveSourceLinks } from './sourceDiscovery.js';
import { materializedSourceTree, pruneMaterializedSourceTrees, retainAcceptedSourceTree, retainCandidateSourceTree, storeSourceTree, type SourceGitTree } from './sourceGit.js';

export interface SnapshotFile {
  digest: string;
  size: number;
}

export interface SourceSnapshot extends SourceSnapshotSummary {
  git?: SourceGitTree;
  /** Used only while discovering live sources; never written to snapshot metadata. */
  transientSourceRoot?: string;
  digest: string;
  files: Record<string, SnapshotFile>;
  directories: string[];
  graph?: WorkingGraphRustOutput;
}

export interface SourcingState {
  version: 1;
  storage?: "git";
  acceptedId: string;
  candidateId?: string;
  history: SourceSnapshotSummary[];
}

export class SourcingError extends Error {
  constructor(message: string, readonly statusCode = 409) { super(message); this.name = 'SourcingError'; }
}

const locks = new Map<string, Promise<unknown>>();
const heldSourcingLocks = new AsyncLocalStorage<ReadonlySet<string>>();

export async function withSourcingLock<T>(bundleDirectory: string, action: () => Promise<T>): Promise<T> {
  if (heldSourcingLocks.getStore()?.has(bundleDirectory)) return await action();
  const held = new Set([...(heldSourcingLocks.getStore() ?? []), bundleDirectory]);
  const previous = locks.get(bundleDirectory) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(() => heldSourcingLocks.run(held, action));
  locks.set(bundleDirectory, pending);
  try { return await pending; }
  finally {
    if (locks.get(bundleDirectory) === pending) {
      locks.delete(bundleDirectory);
      const state = loadSourcingState(bundleDirectory);
      if (state) pruneMaterializedSourceTrees([state.acceptedId, ...(state.candidateId ? [state.candidateId] : [])].map(id => loadSourceSnapshot(bundleDirectory, id).git).filter((git): git is SourceGitTree => Boolean(git)));
    }
  }
}

export function sourcingRoot(bundleDirectory: string): string { return path.join(bundleDirectory, 'raw/sourcing'); }
export function sourcingStatePath(bundleDirectory: string): string { return path.join(sourcingRoot(bundleDirectory), 'state.json'); }

export function snapshotDirectory(bundleDirectory: string, id: string): string {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new SourcingError('Invalid source snapshot identity', 400);
  return path.join(sourcingRoot(bundleDirectory), 'snapshots', id);
}

export function snapshotSourceRoot(bundleDirectory: string, id: string, snapshot?: SourceSnapshot): string {
  if (snapshot?.transientSourceRoot) return snapshot.transientSourceRoot;
  const manifest = path.join(snapshotDirectory(bundleDirectory, id), 'snapshot.json');
  const git = snapshot?.git ?? (fs.existsSync(manifest) ? (JSON.parse(fs.readFileSync(manifest, 'utf8')) as SourceSnapshot).git : undefined);
  if (git) {
    const root = materializedSourceTree(git);
    const directories = snapshot?.directories ?? (JSON.parse(fs.readFileSync(manifest, 'utf8')) as SourceSnapshot).directories;
    for (const directory of directories) fs.mkdirSync(sourcePath(root, directory), { recursive: true });
    return root;
  }
  return path.join(snapshotDirectory(bundleDirectory, id), 'source');
}

export function sha256(bytes: string | Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

export function writeSourcingJson(filename: string, value: unknown): void {
  writeDurableDocument({ path: filename, value: `${JSON.stringify(value, null, 2)}\n`, codec: textDocumentCodec });
}

export function loadSourcingState(bundleDirectory: string): SourcingState | null {
  recoverSourcingAcceptance(bundleDirectory);
  const filename = sourcingStatePath(bundleDirectory);
  if (!fs.existsSync(filename)) return null;
  const state = JSON.parse(fs.readFileSync(filename, 'utf8')) as SourcingState;
  if (state.version !== 1 || !Array.isArray(state.history)) throw new SourcingError('Invalid sourcing state');
  snapshotDirectory(bundleDirectory, state.acceptedId);
  if (state.candidateId) snapshotDirectory(bundleDirectory, state.candidateId);
  return state;
}

export function loadSourceSnapshot(bundleDirectory: string, id: string): SourceSnapshot {
  const snapshot = JSON.parse(fs.readFileSync(path.join(snapshotDirectory(bundleDirectory, id), 'snapshot.json'), 'utf8')) as SourceSnapshot;
  if (snapshot.id !== id || !snapshot.files || !Array.isArray(snapshot.directories)) throw new SourcingError('Invalid source snapshot');
  return snapshot;
}

export function acceptedSourceRoot(bundleDirectory: string): string {
  const state = loadSourcingState(bundleDirectory);
  if (!state) throw new SourcingError('Open Sourcing to capture the first source snapshot before generating.');
  return snapshotSourceRoot(bundleDirectory, state.acceptedId);
}

export function loadSourceBundleConfig(bundleDirectory: string): BundleConfig {
  return YAML.parse(fs.readFileSync(path.join(bundleDirectory, 'config/bundle_config.yaml'), 'utf8')) as BundleConfig;
}

export function loadSourceNodeConfigs(bundleDirectory: string): BundleNodeConfig[] {
  return parseBundleNodeConfig(fs.readFileSync(path.join(bundleDirectory, 'config/bundle_node_config.yaml'), 'utf8'));
}

export function sourceConfigFingerprint(bundleDirectory: string): string {
  return sha256(['bundle_config.yaml', 'bundle_node_config.yaml', 'draft_bundle_node_config.yaml']
    .map(name => {
      const filename = path.join(bundleDirectory, 'config', name);
      return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '';
    }).join('\0'));
}

export function nodeSourcePath(config: BundleNodeConfig): string {
  if (config.bundleNodeKind === 'collection') return `collection:${config.bundleNodeId}`;
  if (config.bundleNodeKind === 'folder') return config.sourceGraphSubdirectory;
  const extension = config.fileType === 'excalidraw' ? 'excalidraw.md' : config.fileType;
  return path.posix.join(config.sourceGraphSubdirectory ?? '', `${config.bundleNodeName}.${extension}`);
}

export function snapshotFilePath(snapshot: SourceSnapshot, config: BundleNodeConfig): string {
  const canonical = nodeSourcePath(config);
  if (snapshot.files[canonical]) return canonical;
  if (config.bundleNodeKind === 'file' && config.fileType === 'excalidraw') {
    const alternative = path.posix.join(config.sourceGraphSubdirectory ?? '', `${config.bundleNodeName}.md`);
    if (snapshot.files[alternative]) return alternative;
  }
  return canonical;
}

export function sourcePath(root: string, relative: string): string {
  if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(segment => segment === '..' || segment === '.')
    || path.isAbsolute(relative)) throw new SourcingError('Invalid source path', 400);
  const result = path.resolve(root, relative);
  if (result !== path.resolve(root) && !result.startsWith(`${path.resolve(root)}${path.sep}`)) throw new SourcingError('Source path is outside the snapshot', 400);
  return result;
}

function inventory(root: string): Pick<SourceSnapshot, 'files' | 'directories' | 'digest' | 'fileCount'> {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new SourcingError('Source directory is unavailable; the accepted snapshot has been kept.');
  const files: Record<string, SnapshotFile> = {};
  const directories: string[] = [];
  const visit = (directory: string, relative: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name.endsWith('.nodespec.yaml')) continue;
      const key = relative ? `${relative}/${entry.name}` : entry.name;
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new SourcingError(`Cannot capture the symbolic link ${key}; the accepted snapshot has been kept.`);
      if (entry.isDirectory()) {
        directories.push(key);
        visit(filename, key);
      } else if (entry.isFile()) {
        const contents = fs.readFileSync(filename);
        files[key] = { digest: sha256(contents), size: contents.length };
      }
    }
  };
  visit(root, '');
  return { files, directories, fileCount: Object.keys(files).length, digest: sha256(JSON.stringify({ files, directories })) };
}

export async function snapshotGraph(bundleDirectory: string, snapshot: SourceSnapshot, nodes = loadSourceNodeConfigs(bundleDirectory), frontierDepth = 1, rebuildIndex = false): Promise<WorkingGraphRustOutput> {
  const config = loadSourceBundleConfig(bundleDirectory);
  const appConfig = loadAppConfig(getConfigDirectory());
  const scratchDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-snapshot-graph-'));
  const temporary = path.join(scratchDirectory, 'nodes.yaml');
  try {
    fs.writeFileSync(temporary, stringifyBundleNodeConfig(nodes));
    const graph = await runWorkingGraphJson<WorkingGraphRustOutput>({
      graphRoot: snapshotSourceRoot(bundleDirectory, snapshot.id, snapshot), bundleNodeConfigPath: temporary,
      rebuildIndex, immutableSource: !snapshot.transientSourceRoot,
      cacheConfigIdentity: path.join(sourcingRoot(bundleDirectory), `graph-${sha256(stringifyBundleNodeConfig(nodes))}`),
      entryBundleNodeId: config.entryBundleNodeId!, defaultTraversalBundleNodeId: config.defaultTraversalBundleNodeId!,
      defaultOutlinksDepth: config.defaultOutlinksDepth, defaultInlinksDepth: config.defaultInlinksDepth,
      frontierDepth, allowImagesToExtendToFrontier: config.allowImagesToExtendToFrontier ?? appConfig.allowImagesToExtendToFrontier ?? true, allowLowerDepths: false,
    });
    // Rust root-level node keys begin with '/'; snapshot paths are relative to the source root.
    const relative = (key: string) => key.replace(/^\/+/, '');
    const links = (map: Record<string, string[]>) => Object.fromEntries(Object.entries(map).map(([key, values]) => [relative(key), values.map(relative)]));
    return { ...graph,
      nodes: graph.nodes.map(node => ({ ...node, bundleNodeKey: relative(node.bundleNodeKey), path: node.path.map(relative) })),
      edges: graph.edges.map(edge => ({ ...edge, source: relative(edge.source), target: relative(edge.target) })),
      allInlinkSources: links(graph.allInlinkSources), allOutlinkTargets: links(graph.allOutlinkTargets),
    };
  } finally { fs.rmSync(scratchDirectory, { recursive: true, force: true }); }
}

export async function discoverSourceSnapshot(bundleDirectory: string, rebuildIndex = false): Promise<SourceSnapshot> {
  try {
    const config = loadSourceBundleConfig(bundleDirectory);
    if (!config.sourceDirectory) throw new SourcingError('Bundle has no source directory');
    if (!fs.existsSync(config.sourceDirectory)) throw new SourcingError('Source directory is unavailable; the accepted snapshot has been kept.');
    const live: SourceSnapshot = { id: randomUUID().replace(/-/g, ''), capturedAt: new Date().toISOString(),
      ...sourceInventory({}, []), transientSourceRoot: config.sourceDirectory };
    invalidateWorkingGraphCache(config.sourceDirectory);
    const graph = await snapshotGraph(bundleDirectory, live, loadSourceNodeConfigs(bundleDirectory), 0, rebuildIndex);
    // File metadata comes from the same Rust read that produced each node's parsed links.
    // Physical paths matter: an Excalidraw node can be backed by an ordinary .md filename.
    for (const node of graph.nodes) {
      if (node.bundleNodeKind !== 'file') continue;
      if (!node.sourceFile) throw new SourcingError(`Source metadata is unavailable for ${node.bundleNodeKey}`);
      const { path: filename, digest, size } = node.sourceFile;
      live.files[filename] = { digest, size };
    }
    const scoped = scopeSourceSnapshot(live, graph);
    rememberLiveSourceLinks(bundleDirectory, scoped.digest, graph);
    return scoped;
  } catch (error) {
    forgetLiveSourceLinks(bundleDirectory);
    if (error instanceof SourcingError) throw error;
    throw new SourcingError(error instanceof Error ? error.message : String(error));
  }
}

export async function captureSourceSnapshot(bundleDirectory: string, options: { preserveTrackedContent?: boolean; discovery?: SourceSnapshot } = {}): Promise<SourceSnapshot> {
  const config = loadSourceBundleConfig(bundleDirectory);
  if (options.preserveTrackedContent) {
    const discovery = await discoverSourceSnapshot(bundleDirectory);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-source-import-'));
    try {
      for (const directory of discovery.directories) fs.mkdirSync(sourcePath(temporary, directory), { recursive: true });
      for (const relative of Object.keys(discovery.files)) {
        const destination = sourcePath(temporary, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(sourcePath(discovery.transientSourceRoot!, relative), destination);
      }
      // These bytes were already retained by tracking. Preserve that historical material
      // when introducing snapshots, including a tracked page whose live path has moved.
      for (const node of loadSourceNodeConfigs(bundleDirectory)) {
        if (node.bundleNodeKind !== 'file' || node.listType === 'blacklist') continue;
        const relative = nodeSourcePath(node);
        const retained = sourcePath(path.join(bundleDirectory, 'raw/tracked_page_content'), relative);
        if (!fs.existsSync(retained) || !fs.statSync(retained).isFile()) continue;
        const destination = sourcePath(temporary, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        // Source copies can inherit read-only permissions. Replace the temporary
        // file before overlaying retained bytes; never alter the source itself.
        fs.rmSync(destination, { force: true });
        fs.copyFileSync(retained, destination);
      }
      const imported = { ...discovery, ...sourceInventory(inventory(temporary).files, discovery.directories), transientSourceRoot: temporary };
      imported.graph = await availableSnapshotGraph(bundleDirectory, imported, 0);
      return await captureSourceSnapshot(bundleDirectory, { discovery: imported });
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
  const discovered = options.discovery ?? await discoverSourceSnapshot(bundleDirectory);
  const { transientSourceRoot, ...snapshot } = discovered;
  if (!transientSourceRoot) throw new SourcingError('Source discovery is unavailable');
  const canonicalSource = fs.realpathSync(transientSourceRoot);
  if (path.resolve(bundleDirectory).startsWith(`${canonicalSource}${path.sep}`)) throw new SourcingError('The source directory contains this bundle’s storage. Choose a source directory outside bundle storage.');
  const state = loadSourcingState(bundleDirectory);
  const previous = state ? loadSourceSnapshot(bundleDirectory, state.acceptedId) : undefined;
  const stored = await storeSourceTree(transientSourceRoot, snapshot.files, config.bundleGuid ?? path.basename(bundleDirectory), previous?.git?.commit);
  const captured = sourceInventory(stored.files, snapshot.directories);
  if (captured.digest !== snapshot.digest) throw new SourcingError('Source files changed during capture. Check for changes again.');
  snapshot.git = { commit: stored.commit, tree: stored.tree, branch: stored.branch };
  try { writeSourcingJson(path.join(snapshotDirectory(bundleDirectory, snapshot.id), 'snapshot.json'), snapshot); }
  catch (error) {
    const retained = state?.candidateId ? loadSourceSnapshot(bundleDirectory, state.candidateId).git : previous?.git;
    if (retained) retainCandidateSourceTree(retained);
    throw error;
  }
  return snapshot;
}

export function snapshotSummary(snapshot: SourceSnapshot, acceptedAt?: string): SourceSnapshotSummary {
  return { id: snapshot.id, capturedAt: snapshot.capturedAt, fileCount: snapshot.fileCount, ...(acceptedAt && { acceptedAt }) };
}

/** Convert retained history from its own captured graph, never from today's live library. */
async function migrateSourceSnapshots(bundleDirectory: string, state: SourcingState): Promise<SourcingState> {
  let migrated = false;
  let parent: string | undefined;
  const config = loadSourceBundleConfig(bundleDirectory);
  const ids = [...state.history.map(item => item.id), ...(state.candidateId ? [state.candidateId] : [])];
  for (const id of [...new Set(ids)]) {
    let snapshot = loadSourceSnapshot(bundleDirectory, id);
    const candidate = id === state.candidateId;
    if (!snapshot.git) {
      if (!snapshot.graph) throw new SourcingError('This legacy snapshot has no captured graph. Its original source material has been preserved because it cannot be safely narrowed.');
      const source = snapshotSourceRoot(bundleDirectory, id, snapshot);
      snapshot = scopeSourceSnapshot(snapshot, snapshot.graph);
      const stored = await storeSourceTree(source, snapshot.files, config.bundleGuid ?? path.basename(bundleDirectory), parent);
      if (sourceInventory(stored.files, snapshot.directories).digest !== snapshot.digest) throw new SourcingError('Retained source material changed during migration.');
      snapshot.git = { commit: stored.commit, tree: stored.tree, branch: stored.branch };
      // Publish the immutable reference before removing its former expanded representation.
      if (!candidate) retainAcceptedSourceTree(snapshot.git);
      writeSourcingJson(path.join(snapshotDirectory(bundleDirectory, id), 'snapshot.json'), snapshot);
      fs.rmSync(source, { recursive: true, force: true });
      migrated = true;
    }
    if (!candidate) parent = snapshot.git.commit;
  }
  const next: SourcingState = { ...state, storage: "git", history: state.history.map(item => snapshotSummary(loadSourceSnapshot(bundleDirectory, item.id), item.acceptedAt)) };
  if (JSON.stringify(next) !== JSON.stringify(state)) writeSourcingJson(sourcingStatePath(bundleDirectory), next);
  if (migrated) await commitChangesNative([sourcingRoot(bundleDirectory)], `migrate source snapshots for ${path.basename(bundleDirectory)}`, { configDir: getConfigDirectory() });
  return next;
}

/** Initial capture belongs to Sourcing/curation entry, never to generation. */
export async function initializeSourcing(bundleDirectory: string): Promise<SourcingState> {
  const initialized = loadSourcingState(bundleDirectory);
  if (initialized?.storage === "git") return initialized;
  if (initialized) return await withSourcingLock(bundleDirectory, () => migrateSourceSnapshots(bundleDirectory, initialized));
  return await withSourcingLock(bundleDirectory, async () => {
    const existing = loadSourcingState(bundleDirectory);
    if (existing) return await migrateSourceSnapshots(bundleDirectory, existing);
    const snapshot = await captureSourceSnapshot(bundleDirectory, { preserveTrackedContent: true });
    if (snapshot.git) retainAcceptedSourceTree(snapshot.git);
    const state: SourcingState = { version: 1, storage: "git", acceptedId: snapshot.id, history: [snapshotSummary(snapshot, new Date().toISOString())] };
    const configPath = path.join(bundleDirectory, 'config/bundle_node_config.yaml');
    const nodes = separateTrackingEvidence(bundleDirectory, loadSourceNodeConfigs(bundleDirectory));
    writeDurableDocument({ path: configPath, value: stringifyBundleNodeConfig(nodes), codec: textDocumentCodec });
    writeSourcingJson(sourcingStatePath(bundleDirectory), state);
    if (snapshot.graph) rememberReachableProvenance(bundleDirectory, snapshot, snapshot.graph, nodes);
    if (!path.basename(bundleDirectory).startsWith('.') && fs.existsSync(path.join(getConfigDirectory(), '.git'))) {
      await commitChangesNative([path.dirname(configPath), sourcingRoot(bundleDirectory)], `capture initial source snapshot for ${path.basename(bundleDirectory)}`, { configDir: getConfigDirectory() });
    }
    return state;
  });
}

export function verifySourceSnapshot(bundleDirectory: string, snapshot: SourceSnapshot): void {
  const material = inventory(snapshotSourceRoot(bundleDirectory, snapshot.id));
  const digest = snapshot.git ? sourceInventory(material.files, snapshot.directories).digest : material.digest;
  if (digest !== snapshot.digest) throw new SourcingError('The captured snapshot has changed on disk. Capture a new source update before accepting.');
}

interface AcceptanceJournal { state: SourcingState; nodeConfig: string; bundleConfig?: string; }

function acceptanceJournalPath(bundleDirectory: string): string { return path.join(sourcingRoot(bundleDirectory), 'acceptance-journal.json'); }

function recoverSourcingAcceptance(bundleDirectory: string): void {
  const filename = acceptanceJournalPath(bundleDirectory);
  if (!fs.existsSync(filename)) return;
  const journal = JSON.parse(fs.readFileSync(filename, 'utf8')) as AcceptanceJournal;
  if (!journal.state || typeof journal.nodeConfig !== 'string') throw new SourcingError('Invalid source acceptance recovery record');
  const accepted = loadSourceSnapshot(bundleDirectory, journal.state.acceptedId);
  if (accepted.git) retainAcceptedSourceTree(accepted.git);
  writeSourcingJson(sourcingStatePath(bundleDirectory), journal.state);
  writeDurableDocument({ path: path.join(bundleDirectory, 'config/bundle_node_config.yaml'), value: journal.nodeConfig, codec: textDocumentCodec });
  if (journal.bundleConfig !== undefined) writeDurableDocument({ path: path.join(bundleDirectory, 'config/bundle_config.yaml'), value: journal.bundleConfig, codec: textDocumentCodec });
  fs.rmSync(filename);
}

/** No asynchronous work may occur between these writes; recovery restores both sides after interruption. */
export function installAcceptedSnapshot(bundleDirectory: string, previous: SourcingState, next: SourcingState, configs: BundleNodeConfig[], trackNewPages?: boolean): void {
  const configPath = path.join(bundleDirectory, 'config/bundle_node_config.yaml');
  const bundleConfigPath = path.join(bundleDirectory, 'config/bundle_config.yaml');
  const bundleConfig = fs.readFileSync(bundleConfigPath, 'utf8');
  writeSourcingJson(acceptanceJournalPath(bundleDirectory), { state: previous, nodeConfig: fs.readFileSync(configPath, 'utf8'), bundleConfig });
  try {
    writeDurableDocument({ path: configPath, value: stringifyBundleNodeConfig(configs), codec: textDocumentCodec });
    if (trackNewPages !== undefined) {
      const document = YAML.parseDocument(bundleConfig);
      document.set('trackNewPages', trackNewPages);
      writeDurableDocument({ path: bundleConfigPath, value: document.toString(), codec: textDocumentCodec });
    }
    const accepted = loadSourceSnapshot(bundleDirectory, next.acceptedId);
    if (accepted.git) retainAcceptedSourceTree(accepted.git);
    writeSourcingJson(sourcingStatePath(bundleDirectory), next);
    fs.rmSync(acceptanceJournalPath(bundleDirectory));
  } catch (error) { recoverSourcingAcceptance(bundleDirectory); throw error; }
}

import type { ParticipatesIn, sourceSnapshot } from '../../../../../concepts/index.js';
export type SourceCaptureMeadowConceptParticipations = [ParticipatesIn<typeof sourceSnapshot, "capture", typeof captureSourceSnapshot>];

/** Missing role sources remain reviewable; all other traversal failures are surfaced. */
export async function availableSnapshotGraph(bundleDirectory: string, snapshot: SourceSnapshot, frontierDepth = 1): Promise<WorkingGraphRustOutput | undefined> {
  const config = loadSourceBundleConfig(bundleDirectory);
  const nodes = loadSourceNodeConfigs(bundleDirectory);
  if (missingSnapshotRoles(snapshot, config, nodes).length) return undefined;
  return await snapshotGraph(bundleDirectory, snapshot, nodes, frontierDepth);
}

/** Collection members are required source roles too; the graph root always represents the empty folder locator. */
export function missingSnapshotRoles(snapshot: SourceSnapshot, config: BundleConfig, nodes: BundleNodeConfig[]): BundleNodeConfig[] {
  const roles = new Set([config.entryBundleNodeId, config.defaultTraversalBundleNodeId]);
  for (const node of nodes) if (roles.has(node.bundleNodeId) && node.bundleNodeKind === 'collection') {
    for (const member of node.memberBundleNodeIds) roles.add(member);
  }
  return nodes.filter(node => roles.has(node.bundleNodeId) && (
    node.bundleNodeKind === 'file' ? !snapshot.files[snapshotFilePath(snapshot, node)]
      : node.bundleNodeKind === 'folder' && Boolean(node.sourceGraphSubdirectory) && !snapshot.directories.includes(node.sourceGraphSubdirectory)
  ));
}

export function rememberReachableProvenance(bundleDirectory: string, snapshot: SourceSnapshot, graph: NonNullable<SourceSnapshot['graph']>, configs: BundleNodeConfig[]): void {
  const records = loadTrackingRecords(bundleDirectory);
  for (const config of configs) {
    const node = graph.nodes.find(candidate => candidate.bundleNodeId === config.bundleNodeId);
    if (!node || node.isFrontierNode) continue;
    const route = [...node.path];
    if (route.at(-1) !== node.bundleNodeKey) route.push(node.bundleNodeKey);
    records[config.bundleNodeId] = { ...records[config.bundleNodeId], lastReachable: { path: snapshotFilePath(snapshot, config), snapshotId: snapshot.id, route } };
  }
  saveTrackingRecords(bundleDirectory, records);
}
