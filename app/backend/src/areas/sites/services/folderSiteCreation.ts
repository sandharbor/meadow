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
  CollectionSiteNodeConfig,
  FolderSiteNodeConfig,
  SiteNodeConfig,
  SiteNodeId,
} from '../../../../../shared_code/types/siteNodeConfig.js';
import {
  generateSiteNodeId,
  stringifySiteNodeConfig,
} from '../../../../../shared_code/utils/siteNodeConfigUtils.js';
import { runWorkingGraphRaw } from '../../../shared/utils/workingGraphUtils.js';
import {
  canonicalFolderSiteSourceDirectory,
  FOLDER_SITE_HIGH_IMPACT_RAW_NODES,
  FOLDER_SITE_HIGH_IMPACT_SEED_FILES,
  FOLDER_SITE_MAX_RAW_NODES,
  FOLDER_SITE_MAX_TYPED_EDGES,
  folderName,
  normalizeSelectedFolder,
  updateFingerprintWithFolderSource,
} from '../../../shared/site-config/folderSiteSource.js';
export {
  FOLDER_SITE_HIGH_IMPACT_SEED_FILES,
  FOLDER_SITE_HIGH_IMPACT_RAW_NODES,
  FOLDER_SITE_MAX_RAW_NODES,
  FOLDER_SITE_MAX_TYPED_EDGES,
} from '../../../shared/site-config/folderSiteSource.js';

export interface FolderSitePreflightInput {
  sourceDirectory: string;
  selectedFolders: string[];
  siteName: string;
  defaultOutlinksDepth?: number;
  defaultInlinksDepth?: number;
  plannedFolderSiteNodeIds?: string[];
  plannedCollectionSiteNodeId?: string;
}

export interface FolderSiteCreationPlan {
  sourceDirectory: string;
  normalizedSelectedFolders: string[];
  folderSiteNodeIds: SiteNodeId[];
  collectionSiteNodeId?: SiteNodeId;
  entrySiteNodeId: SiteNodeId;
  defaultOutlinksDepth: number;
  defaultInlinksDepth: number;
}

export interface FolderSitePreflightResult {
  plan: FolderSiteCreationPlan;
  fingerprint: string;
  nodes: SiteNodeConfig[];
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
  highImpactWarning: boolean;
}

type FolderScopeOutput = {
  nodes: Array<{ siteNodeKind: 'file' | 'folder' | 'collection'; is_sensitive?: boolean }>;
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

function validatePlannedId(value: string | undefined, existing: Iterable<string>): SiteNodeId {
  if (value === undefined) return generateSiteNodeId(existing);
  if (!/^[a-z0-9]{12}$/.test(value)) throw new Error(`Invalid planned siteNodeId: ${value}`);
  if (new Set(existing).has(value)) throw new Error(`Duplicate planned siteNodeId: ${value}`);
  return value as SiteNodeId;
}

function buildPlanAndNodes(input: FolderSitePreflightInput): {
  plan: FolderSiteCreationPlan;
  nodes: SiteNodeConfig[];
  duplicateSelections: FolderSitePreflightResult['duplicateSelections'];
  overlaps: FolderSitePreflightResult['overlaps'];
} {
  const sourceRoot = canonicalFolderSiteSourceDirectory(input.sourceDirectory);
  if (!Array.isArray(input.selectedFolders) || input.selectedFolders.length === 0) {
    throw new Error('Select at least one folder');
  }
  const selections = input.selectedFolders.map(selection => normalizeSelectedFolder(sourceRoot, selection));
  const normalizedSelectedFolders: string[] = [];
  const duplicateSelections: FolderSitePreflightResult['duplicateSelections'] = [];
  for (const [inputIndex, selection] of selections.entries()) {
    if (normalizedSelectedFolders.includes(selection)) {
      duplicateSelections.push({ inputIndex, normalizedFolder: selection });
    } else {
      normalizedSelectedFolders.push(selection);
    }
  }

  const overlaps: FolderSitePreflightResult['overlaps'] = [];
  for (const [index, first] of normalizedSelectedFolders.entries()) {
    for (const second of normalizedSelectedFolders.slice(index + 1)) {
      if (first === '' || second.startsWith(`${first}/`)) overlaps.push({ ancestor: first, descendant: second });
      else if (second === '' || first.startsWith(`${second}/`)) overlaps.push({ ancestor: second, descendant: first });
    }
  }

  const ids: SiteNodeId[] = [];
  const folderSiteNodeIds = normalizedSelectedFolders.map((_folder, index) => {
    const id = validatePlannedId(input.plannedFolderSiteNodeIds?.[index], ids);
    ids.push(id);
    return id;
  });
  if (input.plannedFolderSiteNodeIds && input.plannedFolderSiteNodeIds.length !== folderSiteNodeIds.length) {
    throw new Error('plannedFolderSiteNodeIds must match normalized selected-folder count');
  }
  let collectionSiteNodeId: SiteNodeId | undefined;
  if (normalizedSelectedFolders.length > 1) {
    collectionSiteNodeId = validatePlannedId(input.plannedCollectionSiteNodeId, ids);
    ids.push(collectionSiteNodeId);
  } else if (input.plannedCollectionSiteNodeId !== undefined) {
    throw new Error('A single-folder site cannot have a planned collection ID');
  }

  const defaultOutlinksDepth = validateDepth(input.defaultOutlinksDepth, 1, 'defaultOutlinksDepth');
  const defaultInlinksDepth = validateDepth(input.defaultInlinksDepth, 0, 'defaultInlinksDepth');
  const folderNodes: FolderSiteNodeConfig[] = normalizedSelectedFolders.map((locator, index) => ({
    siteNodeName: folderName(sourceRoot, locator),
    sourceGraphSubdirectory: locator,
    siteNodeKind: 'folder',
    siteNodeId: folderSiteNodeIds[index],
    listType: 'whitelist',
  }));
  const collectionNode: CollectionSiteNodeConfig | undefined = collectionSiteNodeId
    ? {
        siteNodeName: input.siteName.trim() || 'Folder site',
        siteNodeKind: 'collection',
        siteNodeId: collectionSiteNodeId,
        listType: 'whitelist',
        memberSiteNodeIds: folderSiteNodeIds,
      }
    : undefined;
  const entrySiteNodeId = collectionSiteNodeId ?? folderSiteNodeIds[0];

  return {
    plan: {
      sourceDirectory: sourceRoot,
      normalizedSelectedFolders,
      folderSiteNodeIds,
      ...(collectionSiteNodeId && { collectionSiteNodeId }),
      entrySiteNodeId,
      defaultOutlinksDepth,
      defaultInlinksDepth,
    },
    nodes: collectionNode ? [...folderNodes, collectionNode] : folderNodes,
    duplicateSelections,
    overlaps,
  };
}

function createFingerprint(plan: FolderSiteCreationPlan, nodes: SiteNodeConfig[]): string {
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

export async function preflightFolderSite(
  input: FolderSitePreflightInput,
  runWorkingGraph: RunWorkingGraph = runWorkingGraphRaw,
): Promise<FolderSitePreflightResult> {
  const built = buildPlanAndNodes(input);
  const fingerprint = createFingerprint(built.plan, built.nodes);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-preflight-'));
  const configPath = path.join(temporaryDirectory, 'site_node_config.yaml');
  try {
    fs.writeFileSync(configPath, stringifySiteNodeConfig(built.nodes), 'utf8');
    const raw = await runWorkingGraph({
      graphRoot: built.plan.sourceDirectory,
      siteNodeConfigPath: configPath,
      entrySiteNodeId: built.plan.entrySiteNodeId,
      defaultTraversalSiteNodeId: built.plan.entrySiteNodeId,
      defaultOutlinksDepth: built.plan.defaultOutlinksDepth,
      defaultInlinksDepth: built.plan.defaultInlinksDepth,
      frontierDepth: 0,
      allowImagesToExtendToFrontier: true,
      allowLowerDepths: false,
    });
    const output = JSON.parse(raw) as FolderScopeOutput;
    if (!output.folderScope) throw new Error('Folder graph builder did not return a scope report');
    const report = output.folderScope;
    if (report.predictedRawNodeCount >= FOLDER_SITE_MAX_RAW_NODES
      || report.predictedTypedEdgeCount >= FOLDER_SITE_MAX_TYPED_EDGES) {
      throw new Error(
        `Folder site is too large (${report.predictedRawNodeCount} raw nodes, `
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
      highImpactWarning: report.supportedSeedFileCount >= FOLDER_SITE_HIGH_IMPACT_SEED_FILES
        || report.predictedRawNodeCount >= FOLDER_SITE_HIGH_IMPACT_RAW_NODES,
    };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function verifyFolderSitePreflight(
  input: FolderSitePreflightInput,
  fingerprint: string,
  runWorkingGraph: RunWorkingGraph = runWorkingGraphRaw,
): Promise<FolderSitePreflightResult> {
  const result = await preflightFolderSite(input, runWorkingGraph);
  if (result.fingerprint !== fingerprint) {
    throw new Error('Folder-site preflight is stale; review the updated prediction before creating the site');
  }
  return result;
}
