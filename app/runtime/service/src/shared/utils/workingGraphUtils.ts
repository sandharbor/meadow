/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { logger } from './logging/backendLoggingUtils.js';
import { resolveNativeRustBinaryPath } from '../../../../../shared_code/utils/nativeRustBinaryPath.js';
import { parseBundleNodeConfig } from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';

function execWorkingGraph(binaryPath: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      binaryPath,
      args,
      { timeout: 60000, maxBuffer: 250 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as unknown as Error & { stderr?: string; stdout?: string };
          const message = `${err.message}${stderr ? `\n${stderr}` : ''}`;
          return reject(Object.assign(new Error(message), { cause: error }));
        }
        if (stderr && stderr.length > 0 && !stdout) return reject(new Error(stderr));
        resolve(stdout);
      }
    );
  });
}

/**
 * Gets the working_graph binary path, checking environment variable first then falling back to relative path.
 * Backend should fail fast if the release binary is missing (no cargo-run fallback).
 */
export function getWorkingGraphPath(): string {
  const binaryPath = resolveNativeRustBinaryPath({
    importMetaUrl: import.meta.url,
    upLevelsToApp: 5,
    cratePathSegments: ['working_graph', 'working_graph_code'],
    binaryName: 'working_graph_bin',
    envVar: 'WORKING_GRAPH_PATH'
  });
  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      `working_graph_bin not found at ${binaryPath}. Build it with ` +
        '`cd app/runtime/native/working_graph/working_graph_code && cargo build --release --bin working_graph_bin` ' +
        'or set WORKING_GRAPH_PATH.'
    );
  }
  return binaryPath;
}

export type WorkingGraphRunArgs = {
  graphRoot: string;
  bundleNodeConfigPath: string;
  entryBundleNodeId: string;
  defaultTraversalBundleNodeId: string;
  defaultOutlinksDepth?: number;
  defaultInlinksDepth?: number;
  frontierDepth: number;
  allowImagesToExtendToFrontier: boolean;
  allowLowerDepths: boolean;
};

type SourceWatch = {
  revision: number;
  watcher: fs.FSWatcher;
};

type CachedWorkingGraph = {
  graphRoot: string;
  result: Promise<string>;
  parsedResult?: Promise<unknown>;
};

const MAX_WORKING_GRAPH_CACHE_ENTRIES = 8;
const sourceWatches = new Map<string, SourceWatch>();
const workingGraphCache = new Map<string, CachedWorkingGraph>();

export function invalidateWorkingGraphCache(graphRoot: string): void {
  const normalizedRoot = path.resolve(graphRoot);
  for (const [key, entry] of workingGraphCache) {
    if (entry.graphRoot === normalizedRoot) workingGraphCache.delete(key);
  }
}

function sourceRevision(graphRoot: string): number | null {
  const normalizedRoot = path.resolve(graphRoot);
  const existing = sourceWatches.get(normalizedRoot);
  if (existing) return existing.revision;
  try {
    const watch: SourceWatch = {
      revision: 0,
      watcher: fs.watch(normalizedRoot, { recursive: true }, () => {
        watch.revision += 1;
        invalidateWorkingGraphCache(normalizedRoot);
      }),
    };
    watch.watcher.on('error', () => {
      invalidateWorkingGraphCache(normalizedRoot);
      sourceWatches.delete(normalizedRoot);
      watch.watcher.close();
    });
    watch.watcher.unref();
    sourceWatches.set(normalizedRoot, watch);
    return watch.revision;
  } catch {
    // If recursive watching is unavailable, favor correctness and skip caching.
    return null;
  }
}

/**
 * Only traversal policy belongs in the expensive working-graph cache key.
 * Plain tracking state and tracking evidence are applied to the graph after
 * traversal, so changing either must not force a full source-graph rebuild.
 */
export function workingGraphTopologyFingerprint(
  configContents: string,
  entryBundleNodeId: string,
  defaultTraversalBundleNodeId: string,
): string {
  const configs = parseBundleNodeConfig(configContents);
  const topologyNodeIds = new Set([entryBundleNodeId, defaultTraversalBundleNodeId]);
  for (const config of configs) {
    if (config.bundleNodeKind === 'collection') {
      topologyNodeIds.add(config.bundleNodeId);
      config.memberBundleNodeIds.forEach(id => topologyNodeIds.add(id));
    }
  }
  const topologyConfigs = configs
    .filter(config => (
      topologyNodeIds.has(config.bundleNodeId)
      || config.bundleNodeKind === 'collection'
      || config.listType === 'blacklist'
      || config.outlinksDepth !== undefined
      || config.inlinksDepth !== undefined
    ))
    .map(config => {
      if (config.bundleNodeKind !== 'file') return config;
      const topologyConfig = { ...config };
      delete topologyConfig.trackingEvidence;
      return topologyConfig;
    })
    .sort((left, right) => left.bundleNodeId.localeCompare(right.bundleNodeId));
  return createHash('sha256')
    .update(JSON.stringify(topologyConfigs))
    .digest('hex');
}

function cacheKey(runArgs: WorkingGraphRunArgs, revision: number): string {
  const configContents = fs.readFileSync(runArgs.bundleNodeConfigPath, 'utf8');
  return JSON.stringify({
    ...runArgs,
    graphRoot: path.resolve(runArgs.graphRoot),
    bundleNodeConfigPath: path.resolve(runArgs.bundleNodeConfigPath),
    topologyFingerprint: workingGraphTopologyFingerprint(
      configContents,
      runArgs.entryBundleNodeId,
      runArgs.defaultTraversalBundleNodeId,
    ),
    sourceRevision: revision,
  });
}

function rememberWorkingGraph(
  key: string,
  graphRoot: string,
  result: Promise<string>,
): CachedWorkingGraph {
  const entry = { graphRoot, result };
  workingGraphCache.set(key, entry);
  while (workingGraphCache.size > MAX_WORKING_GRAPH_CACHE_ENTRIES) {
    const oldestKey = workingGraphCache.keys().next().value;
    if (oldestKey === undefined) break;
    workingGraphCache.delete(oldestKey);
  }
  result.catch(() => {
    if (workingGraphCache.get(key)?.result === result) workingGraphCache.delete(key);
  });
  return entry;
}

function workingGraphCommand(runArgs: WorkingGraphRunArgs): {
  binaryPath: string;
  args: string[];
} {
  const binaryPath = getWorkingGraphPath();
  const args: string[] = [
    '--graph-root',
    runArgs.graphRoot,
    '--bundle-node-config',
    runArgs.bundleNodeConfigPath,
    '--entry-bundle-node-id',
    runArgs.entryBundleNodeId,
    '--default-traversal-bundle-node-id',
    runArgs.defaultTraversalBundleNodeId,
    '--frontier-depth',
    String(runArgs.frontierDepth),
    '--allow-images-to-extend-to-frontier',
    runArgs.allowImagesToExtendToFrontier ? 'true' : 'false',
  ];

  if (runArgs.defaultOutlinksDepth !== undefined) {
    args.push('--default-outlinks-depth', String(runArgs.defaultOutlinksDepth));
  }
  if (runArgs.defaultInlinksDepth !== undefined) {
    args.push('--default-inlinks-depth', String(runArgs.defaultInlinksDepth));
  }

  if (runArgs.allowLowerDepths) {
    args.push('--allow-lower-depths');
  }
  return { binaryPath, args };
}

function getWorkingGraphEntry(runArgs: WorkingGraphRunArgs): CachedWorkingGraph {
  const { binaryPath, args } = workingGraphCommand(runArgs);
  const normalizedRoot = path.resolve(runArgs.graphRoot);
  const revision = sourceRevision(normalizedRoot);
  if (revision !== null) {
    const key = cacheKey(runArgs, revision);
    const cached = workingGraphCache.get(key);
    if (cached) {
      // Refresh insertion order so the bounded map behaves as an LRU cache.
      workingGraphCache.delete(key);
      workingGraphCache.set(key, cached);
      logger.debug(`Reusing working_graph result for ${runArgs.bundleNodeConfigPath}`);
      return cached;
    }
    logger.debug(`Executing working_graph command: "${binaryPath}" ${args.map(a => JSON.stringify(a)).join(' ')}`);
    return rememberWorkingGraph(
      key,
      normalizedRoot,
      execWorkingGraph(binaryPath, args),
    );
  }

  logger.debug(`Executing working_graph command: "${binaryPath}" ${args.map(a => JSON.stringify(a)).join(' ')}`);
  return { graphRoot: normalizedRoot, result: execWorkingGraph(binaryPath, args) };
}

export async function runWorkingGraphRaw(runArgs: WorkingGraphRunArgs): Promise<string> {
  return await getWorkingGraphEntry(runArgs).result;
}

export async function runWorkingGraphJson<T>(runArgs: WorkingGraphRunArgs): Promise<T> {
  const entry = getWorkingGraphEntry(runArgs);
  entry.parsedResult ??= entry.result.then(raw => JSON.parse(raw) as unknown);
  return await entry.parsedResult as T;
}
