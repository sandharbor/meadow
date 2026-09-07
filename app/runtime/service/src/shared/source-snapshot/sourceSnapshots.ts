/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
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
import { runWorkingGraphJson } from '../utils/workingGraphUtils.js';
import type { WorkingGraphRustOutput } from '../bundle-graph/workingGraphService.js';

export interface SnapshotFile {
  digest: string;
  size: number;
}

export interface SourceSnapshot extends SourceSnapshotSummary {
  digest: string;
  files: Record<string, SnapshotFile>;
  directories: string[];
  graph?: WorkingGraphRustOutput;
}

export interface SourcingState {
  version: 1;
  acceptedId: string;
  candidateId?: string;
  history: SourceSnapshotSummary[];
}

export class SourcingError extends Error {
  constructor(message: string, readonly statusCode = 409) { super(message); this.name = 'SourcingError'; }
}

const locks = new Map<string, Promise<unknown>>();

export async function withSourcingLock<T>(bundleDirectory: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(bundleDirectory) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(action);
  locks.set(bundleDirectory, pending);
  try { return await pending; }
  finally { if (locks.get(bundleDirectory) === pending) locks.delete(bundleDirectory); }
}

export function sourcingRoot(bundleDirectory: string): string { return path.join(bundleDirectory, 'raw/sourcing'); }
export function sourcingStatePath(bundleDirectory: string): string { return path.join(sourcingRoot(bundleDirectory), 'state.json'); }

export function snapshotDirectory(bundleDirectory: string, id: string): string {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new SourcingError('Invalid source snapshot identity', 400);
  return path.join(sourcingRoot(bundleDirectory), 'snapshots', id);
}

export function snapshotSourceRoot(bundleDirectory: string, id: string): string {
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

function inventory(root: string, copyTo?: string): Pick<SourceSnapshot, 'files' | 'directories' | 'digest' | 'fileCount'> {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new SourcingError('Source directory is unavailable; the accepted snapshot has been kept.');
  const files: Record<string, SnapshotFile> = {};
  const directories: string[] = [];
  const visit = (directory: string, relative: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name.endsWith('.pagespec.yaml')) continue;
      const key = relative ? `${relative}/${entry.name}` : entry.name;
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new SourcingError(`Cannot capture the symbolic link ${key}; the accepted snapshot has been kept.`);
      if (entry.isDirectory()) {
        directories.push(key);
        if (copyTo) fs.mkdirSync(sourcePath(copyTo, key), { recursive: true });
        visit(filename, key);
      } else if (entry.isFile()) {
        const contents = fs.readFileSync(filename);
        files[key] = { digest: sha256(contents), size: contents.length };
        if (copyTo) {
          const target = sourcePath(copyTo, key);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, contents);
        }
      }
    }
  };
  visit(root, '');
  return { files, directories, fileCount: Object.keys(files).length, digest: sha256(JSON.stringify({ files, directories })) };
}

export async function snapshotGraph(bundleDirectory: string, snapshot: SourceSnapshot, nodes = loadSourceNodeConfigs(bundleDirectory), frontierDepth = 1): Promise<WorkingGraphRustOutput> {
  const config = loadSourceBundleConfig(bundleDirectory);
  const appConfig = loadAppConfig(getConfigDirectory());
  const temporary = path.join(sourcingRoot(bundleDirectory), `graph-${randomUUID()}.yaml`);
  fs.writeFileSync(temporary, stringifyBundleNodeConfig(nodes));
  try {
    const graph = await runWorkingGraphJson<WorkingGraphRustOutput>({
      graphRoot: snapshotSourceRoot(bundleDirectory, snapshot.id), bundleNodeConfigPath: temporary,
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
  } finally { fs.rmSync(temporary, { force: true }); }
}

export async function captureSourceSnapshot(bundleDirectory: string, options: { preserveTrackedContent?: boolean } = {}): Promise<SourceSnapshot> {
  const config = loadSourceBundleConfig(bundleDirectory);
  if (!config.sourceDirectory) throw new SourcingError('Bundle has no source directory');
  const id = randomUUID().replace(/-/g, '');
  const source = snapshotSourceRoot(bundleDirectory, id);
  if (!fs.existsSync(config.sourceDirectory)) throw new SourcingError('Source directory is unavailable; the accepted snapshot has been kept.');
  const canonicalSource = fs.realpathSync(config.sourceDirectory);
  if (path.resolve(bundleDirectory).startsWith(`${canonicalSource}${path.sep}`)) throw new SourcingError('The source directory contains this bundle’s storage. Choose a source directory outside bundle storage.');
  fs.mkdirSync(source, { recursive: true });
  try {
    const first = inventory(config.sourceDirectory, source);
    if (inventory(config.sourceDirectory).digest !== first.digest) throw new SourcingError('Source files changed during capture. Check for changes again.');
    // Import the retained source material when upgrading a bundle with an existing tracked snapshot.
    if (options.preserveTrackedContent) {
      const trackedRoot = path.join(bundleDirectory, 'raw/tracked_page_content');
      for (const node of loadSourceNodeConfigs(bundleDirectory)) {
        if (node.bundleNodeKind !== 'file' || node.listType === 'blacklist') continue;
        const relative = nodeSourcePath(node);
        const retained = sourcePath(trackedRoot, relative);
        if (fs.existsSync(retained) && fs.statSync(retained).isFile()) {
          const destination = sourcePath(source, relative);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.copyFileSync(retained, destination);
        }
      }
    }
    const snapshot: SourceSnapshot = { id, capturedAt: new Date().toISOString(), ...inventory(source) };
    snapshot.graph = await availableSnapshotGraph(bundleDirectory, snapshot);
    writeSourcingJson(path.join(snapshotDirectory(bundleDirectory, id), 'snapshot.json'), snapshot);
    return snapshot;
  } catch (error) {
    fs.rmSync(snapshotDirectory(bundleDirectory, id), { recursive: true, force: true });
    throw error;
  }
}

export function snapshotSummary(snapshot: SourceSnapshot, acceptedAt?: string): SourceSnapshotSummary {
  return { id: snapshot.id, capturedAt: snapshot.capturedAt, fileCount: snapshot.fileCount, ...(acceptedAt && { acceptedAt }) };
}

/** Initial capture belongs to Sourcing/curation entry, never to generation. */
export async function initializeSourcing(bundleDirectory: string): Promise<SourcingState> {
  const initialized = loadSourcingState(bundleDirectory);
  if (initialized) return initialized;
  return await withSourcingLock(bundleDirectory, async () => {
    const existing = loadSourcingState(bundleDirectory);
    if (existing) return existing;
    const snapshot = await captureSourceSnapshot(bundleDirectory, { preserveTrackedContent: true });
    const state: SourcingState = { version: 1, acceptedId: snapshot.id, history: [snapshotSummary(snapshot, new Date().toISOString())] };
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
  if (inventory(snapshotSourceRoot(bundleDirectory, snapshot.id)).digest !== snapshot.digest) throw new SourcingError('The captured snapshot has changed on disk. Capture a new source update before accepting.');
}

interface AcceptanceJournal { state: SourcingState; nodeConfig: string; }

function acceptanceJournalPath(bundleDirectory: string): string { return path.join(sourcingRoot(bundleDirectory), 'acceptance-journal.json'); }

function recoverSourcingAcceptance(bundleDirectory: string): void {
  const filename = acceptanceJournalPath(bundleDirectory);
  if (!fs.existsSync(filename)) return;
  const journal = JSON.parse(fs.readFileSync(filename, 'utf8')) as AcceptanceJournal;
  if (!journal.state || typeof journal.nodeConfig !== 'string') throw new SourcingError('Invalid source acceptance recovery record');
  writeSourcingJson(sourcingStatePath(bundleDirectory), journal.state);
  writeDurableDocument({ path: path.join(bundleDirectory, 'config/bundle_node_config.yaml'), value: journal.nodeConfig, codec: textDocumentCodec });
  fs.rmSync(filename);
}

/** No asynchronous work may occur between these writes; recovery restores both sides after interruption. */
export function installAcceptedSnapshot(bundleDirectory: string, previous: SourcingState, next: SourcingState, configs: BundleNodeConfig[]): void {
  const configPath = path.join(bundleDirectory, 'config/bundle_node_config.yaml');
  writeSourcingJson(acceptanceJournalPath(bundleDirectory), { state: previous, nodeConfig: fs.readFileSync(configPath, 'utf8') });
  try {
    writeDurableDocument({ path: configPath, value: stringifyBundleNodeConfig(configs), codec: textDocumentCodec });
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

export function liveSourceDigest(bundleDirectory: string): string {
  const config = loadSourceBundleConfig(bundleDirectory);
  if (!config.sourceDirectory) throw new SourcingError('Bundle has no source directory');
  return inventory(config.sourceDirectory).digest;
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
