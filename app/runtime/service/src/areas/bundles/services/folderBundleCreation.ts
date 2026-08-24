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

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  CollectionBundleNodeConfig,
  FolderBundleNodeConfig,
  BundleNodeConfig,
  BundleNodeId,
} from '../../../../../../shared_code/types/bundleNodeConfig.js';
import {
  generateBundleNodeId,
  stringifyBundleNodeConfig,
} from '../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { runWorkingGraphRaw } from '../../../shared/utils/workingGraphUtils.js';
import {
  canonicalFolderBundleSourceDirectory,
  FOLDER_BUNDLE_MAX_RAW_NODES,
  FOLDER_BUNDLE_MAX_TYPED_EDGES,
  folderName,
  normalizeSelectedFolder,
  updateFingerprintWithFolderSource,
} from '../../../shared/bundle-config/folderBundleSource.js';
export {
  FOLDER_BUNDLE_MAX_RAW_NODES,
  FOLDER_BUNDLE_MAX_TYPED_EDGES,
} from '../../../shared/bundle-config/folderBundleSource.js';

export interface FolderBundlePreflightInput {
  sourceDirectory: string;
  selectedFolders: string[];
  bundleName: string;
  defaultOutlinksDepth?: number;
  defaultInlinksDepth?: number;
  plannedFolderBundleNodeIds?: string[];
  plannedCollectionBundleNodeId?: string;
}

export interface FolderBundleCreationPlan {
  sourceDirectory: string;
  normalizedSelectedFolders: string[];
  folderBundleNodeIds: BundleNodeId[];
  collectionBundleNodeId?: BundleNodeId;
  entryBundleNodeId: BundleNodeId;
  defaultOutlinksDepth: number;
  defaultInlinksDepth: number;
}

export interface FolderBundlePreflightResult {
  plan: FolderBundleCreationPlan;
  fingerprint: string;
  nodes: BundleNodeConfig[];
  duplicateSelections: Array<{ inputIndex: number; normalizedFolder: string }>;
  overlaps: Array<{ ancestor: string; descendant: string }>;
  supportedSeedFileCount: number;
  requiredRawFolderNodeCount: number;
  skippedCounts: Record<string, number>;
  skippedPaths: Array<{ path: string; reason: string }>;
  skippedPathCount: number;
  effectiveDefaultDepths: { outlinks: number; inlinks: number };
  predictedRawNodeCount: number;
  predictedTypedEdgeCount: number;
  sensitiveNodeCount: number;
  preferredRouteCollisions: string[];
}

type FolderScopeOutput = {
  nodes: Array<{ bundleNodeKind: 'file' | 'folder' | 'collection'; is_sensitive?: boolean }>;
  edges: unknown[];
  folderScope?: {
    normalizedSelectedFolders: string[];
    supportedSeedFileCount: number;
    requiredRawFolderNodeCount: number;
    skippedCounts: Record<string, number>;
    skippedPaths: Array<{ path: string; reason: string }>;
    skippedPathCount: number;
    predictedRawNodeCount: number;
    predictedTypedEdgeCount: number;
  };
};

type RunWorkingGraph = typeof runWorkingGraphRaw;

function validateDepth(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return resolved;
}

function validatePlannedId(value: string | undefined, existing: Iterable<string>): BundleNodeId {
  if (value === undefined) return generateBundleNodeId(existing);
  if (!/^[a-z0-9]{12}$/.test(value)) throw new Error(`Invalid planned bundleNodeId: ${value}`);
  if (new Set(existing).has(value)) throw new Error(`Duplicate planned bundleNodeId: ${value}`);
  return value as BundleNodeId;
}

function buildPlanAndNodes(input: FolderBundlePreflightInput): {
  plan: FolderBundleCreationPlan;
  nodes: BundleNodeConfig[];
  duplicateSelections: FolderBundlePreflightResult['duplicateSelections'];
  overlaps: FolderBundlePreflightResult['overlaps'];
} {
  const sourceRoot = canonicalFolderBundleSourceDirectory(input.sourceDirectory);
  if (!Array.isArray(input.selectedFolders) || input.selectedFolders.length === 0) {
    throw new Error('Select at least one folder');
  }
  const selections = input.selectedFolders.map(selection => normalizeSelectedFolder(sourceRoot, selection));
  const normalizedSelectedFolders: string[] = [];
  const duplicateSelections: FolderBundlePreflightResult['duplicateSelections'] = [];
  for (const [inputIndex, selection] of selections.entries()) {
    if (normalizedSelectedFolders.includes(selection)) {
      duplicateSelections.push({ inputIndex, normalizedFolder: selection });
    } else {
      normalizedSelectedFolders.push(selection);
    }
  }

  const overlaps: FolderBundlePreflightResult['overlaps'] = [];
  for (const [index, first] of normalizedSelectedFolders.entries()) {
    for (const second of normalizedSelectedFolders.slice(index + 1)) {
      if (first === '' || second.startsWith(`${first}/`)) overlaps.push({ ancestor: first, descendant: second });
      else if (second === '' || first.startsWith(`${second}/`)) overlaps.push({ ancestor: second, descendant: first });
    }
  }

  const ids: BundleNodeId[] = [];
  const folderBundleNodeIds = normalizedSelectedFolders.map((_folder, index) => {
    const id = validatePlannedId(input.plannedFolderBundleNodeIds?.[index], ids);
    ids.push(id);
    return id;
  });
  if (input.plannedFolderBundleNodeIds && input.plannedFolderBundleNodeIds.length !== folderBundleNodeIds.length) {
    throw new Error('plannedFolderBundleNodeIds must match normalized selected-folder count');
  }
  let collectionBundleNodeId: BundleNodeId | undefined;
  if (normalizedSelectedFolders.length > 1) {
    collectionBundleNodeId = validatePlannedId(input.plannedCollectionBundleNodeId, ids);
    ids.push(collectionBundleNodeId);
  } else if (input.plannedCollectionBundleNodeId !== undefined) {
    throw new Error('A single-folder bundle cannot have a planned collection ID');
  }

  const defaultOutlinksDepth = validateDepth(input.defaultOutlinksDepth, 1, 'defaultOutlinksDepth');
  const defaultInlinksDepth = validateDepth(input.defaultInlinksDepth, 0, 'defaultInlinksDepth');
  const folderNodes: FolderBundleNodeConfig[] = normalizedSelectedFolders.map((locator, index) => ({
    bundleNodeName: folderName(sourceRoot, locator),
    sourceGraphSubdirectory: locator,
    bundleNodeKind: 'folder',
    bundleNodeId: folderBundleNodeIds[index],
    listType: 'whitelist',
  }));
  const collectionNode: CollectionBundleNodeConfig | undefined = collectionBundleNodeId
    ? {
        bundleNodeName: input.bundleName.trim() || 'Folder bundle',
        bundleNodeKind: 'collection',
        bundleNodeId: collectionBundleNodeId,
        listType: 'whitelist',
        memberBundleNodeIds: folderBundleNodeIds,
      }
    : undefined;
  const entryBundleNodeId = collectionBundleNodeId ?? folderBundleNodeIds[0];

  return {
    plan: {
      sourceDirectory: sourceRoot,
      normalizedSelectedFolders,
      folderBundleNodeIds,
      ...(collectionBundleNodeId && { collectionBundleNodeId }),
      entryBundleNodeId,
      defaultOutlinksDepth,
      defaultInlinksDepth,
    },
    nodes: collectionNode ? [...folderNodes, collectionNode] : folderNodes,
    duplicateSelections,
    overlaps,
  };
}

function createFingerprint(plan: FolderBundleCreationPlan, nodes: BundleNodeConfig[]): string {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify({
    sourceDirectory: plan.sourceDirectory,
    selectedFolders: plan.normalizedSelectedFolders,
    defaultOutlinksDepth: plan.defaultOutlinksDepth,
    defaultInlinksDepth: plan.defaultInlinksDepth,
    nodes,
  }));
  updateFingerprintWithFolderSource(hash, plan.sourceDirectory, plan.normalizedSelectedFolders);
  return hash.digest('hex');
}

export async function preflightFolderBundle(
  input: FolderBundlePreflightInput,
  runWorkingGraph: RunWorkingGraph = runWorkingGraphRaw,
): Promise<FolderBundlePreflightResult> {
  const built = buildPlanAndNodes(input);
  const fingerprint = createFingerprint(built.plan, built.nodes);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-preflight-'));
  const configPath = path.join(temporaryDirectory, 'bundle_node_config.yaml');
  try {
    fs.writeFileSync(configPath, stringifyBundleNodeConfig(built.nodes), 'utf8');
    const raw = await runWorkingGraph({
      graphRoot: built.plan.sourceDirectory,
      bundleNodeConfigPath: configPath,
      entryBundleNodeId: built.plan.entryBundleNodeId,
      defaultTraversalBundleNodeId: built.plan.entryBundleNodeId,
      defaultOutlinksDepth: built.plan.defaultOutlinksDepth,
      defaultInlinksDepth: built.plan.defaultInlinksDepth,
      frontierDepth: 0,
      allowImagesToExtendToFrontier: true,
      allowLowerDepths: false,
    });
    const output = JSON.parse(raw) as FolderScopeOutput;
    if (!output.folderScope) throw new Error('Folder graph builder did not return a scope report');
    const report = output.folderScope;
    if (report.supportedSeedFileCount === 0) {
      throw new Error('Selected folders do not contain any supported files');
    }
    if (report.predictedRawNodeCount >= FOLDER_BUNDLE_MAX_RAW_NODES
      || report.predictedTypedEdgeCount >= FOLDER_BUNDLE_MAX_TYPED_EDGES) {
      throw new Error(
        `Folder bundle is too large (${report.predictedRawNodeCount} raw nodes, `
        + `${report.predictedTypedEdgeCount} typed edges). Narrow the selected folders or semantic depths.`,
      );
    }
    return {
      ...built,
      fingerprint,
      supportedSeedFileCount: report.supportedSeedFileCount,
      requiredRawFolderNodeCount: report.requiredRawFolderNodeCount,
      skippedCounts: report.skippedCounts,
      skippedPaths: report.skippedPaths,
      skippedPathCount: report.skippedPathCount,
      effectiveDefaultDepths: {
        outlinks: built.plan.defaultOutlinksDepth,
        inlinks: built.plan.defaultInlinksDepth,
      },
      predictedRawNodeCount: report.predictedRawNodeCount,
      predictedTypedEdgeCount: report.predictedTypedEdgeCount,
      sensitiveNodeCount: output.nodes.filter(node => node.is_sensitive).length,
      preferredRouteCollisions: [],
    };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function verifyFolderBundlePreflight(
  input: FolderBundlePreflightInput,
  fingerprint: string,
  runWorkingGraph: RunWorkingGraph = runWorkingGraphRaw,
): Promise<FolderBundlePreflightResult> {
  const result = await preflightFolderBundle(input, runWorkingGraph);
  if (result.fingerprint !== fingerprint) {
    throw new Error('Folder-bundle preflight is stale; review the updated prediction before creating the bundle');
  }
  return result;
}
