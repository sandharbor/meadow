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

import { loadTrackingRecords, saveTrackingRecords, trackingRecordsPath } from '../bundle-node/trackingRecords.js';
import { acceptedSourceRoot } from '../source-snapshot/sourceSnapshots.js';

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  BUNDLE_BOUNDARY_REVIEW_SCHEMA_VERSION,
  type BundleBoundaryFinding,
  type BundleBoundaryReviewRequest,
} from '../../../../../contracts/types/shared/bundle-boundary-review/bundleBoundaryReview.js';
import { Graph } from '../../../../../contracts/types/shared/bundle-graph/graph.js';
import type { FileBundleNodeConfig } from '../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import type { IBundleNode } from '../../../../../contracts/types/shared/bundle-graph/IBundleNode.js';
import {
  applyNodeConfigsToNodes,
  applySensitiveFromApiData,
  nodeConfigMatchesNode,
} from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../shared_code/utils/appConfigGitUtils.js';
import {
  getBundleDirectory,
  getBundlesDirectory,
  getConfigDirectory,
} from '../bundle-config/bundleConfigPaths.js';
import { currentSourceContentDigest } from '../bundle-node/trackingEvidence.js';
import { loadCustomFiltersForBundle } from '../custom-filters/customFilterLoader.js';
import { CommandFilterIncompleteError, selectEffectivelySensitiveNodeKeys } from '../bundle-graph/graphFilterService.js';
import { loadWorkingGraph } from '../bundle-graph/workingGraphService.js';
import { appPlacePath } from '../../../../../contracts/places/index.js';

import type { CustomFilterConfig } from '../../../../../contracts/types/shared/curation/customFilters.js';

const pendingPolicyChanges = new Map<string, { filterId: string; event: 'created' | 'enabled' | 'edited'; previousFilters: CustomFilterConfig[] }>();

const REVIEW_REQUEST_ID_PATTERN = /^bbr_[a-f0-9]{24}$/;

function requestDirectory(slug: string): string {
  return path.join(getBundleDirectory(slug), 'review', 'requests');
}

function requestPath(slug: string, reviewRequestId: string): string {
  return path.join(requestDirectory(slug), `${reviewRequestId}.json`);
}

function requestId(slug: string, findings: BundleBoundaryFinding[]): string {
  const stableFindings = findings
    .map(finding => `${finding.bundleNodeId}:${finding.code}`)
    .sort();
  const digest = createHash('sha256')
    .update(JSON.stringify({ slug, findings: stableFindings }))
    .digest('hex')
    .slice(0, 24);
  return `bbr_${digest}`;
}

function readRequest(filePath: string): BundleBoundaryReviewRequest {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as BundleBoundaryReviewRequest;
}

function writeRequest(filePath: string, request: BundleBoundaryReviewRequest): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

async function commitReviewRequests(slug: string, message: string): Promise<void> {
  const git = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, getConfigDirectory());
  const requests = fs.readdirSync(requestDirectory(slug)).filter(name => name.endsWith('.json'))
    .map(name => `bundles/${slug}/review/requests/${name}`);
  await git.commitFiles([...requests, ...(fs.existsSync(trackingRecordsPath(getBundleDirectory(slug)))
    ? [`bundles/${slug}/raw/sourcing/tracking.json`] : [])], message);
}

function sameReviewState(
  left: BundleBoundaryReviewRequest,
  right: BundleBoundaryReviewRequest,
): boolean {
  return JSON.stringify({ status: left.status, policy: left.policy, findings: left.findings, deepLinkPath: left.deepLinkPath })
    === JSON.stringify({ status: right.status, policy: right.policy, findings: right.findings, deepLinkPath: right.deepLinkPath });
}

export function deriveTrackingEvidenceFindings(options: {
  config: FileBundleNodeConfig;
  node: IBundleNode;
  sourceContentDigest: `sha256:${string}`;
  effectivelySensitive: boolean;
}): BundleBoundaryFinding[] {
  const evidence = options.config.trackingEvidence;
  if (!evidence) return [];
  const common = {
    bundleNodeId: options.config.bundleNodeId,
    bundleNodeKey: options.node.bundleNodeKey,
    bundleNodeName: options.node.bundleNodeName,
    sourceContentDigest: options.sourceContentDigest,
    recordedSourceContentDigest: evidence.sourceContentDigest,
    effectivelySensitive: options.effectivelySensitive,
    recordedEffectivelySensitive: evidence.effectivelySensitive,
  };
  const findings: BundleBoundaryFinding[] = [];
  if (options.sourceContentDigest !== evidence.sourceContentDigest) {
    findings.push({
      ...common,
      code: 'content-changed-since-tracking',
      policy: 'recommend-review',
      message: 'Source content changed since its most recent explicit inclusion decision.',
    });
  }
  if (!evidence.effectivelySensitive && options.effectivelySensitive) {
    findings.push({
      ...common,
      code: 'sensitivity-reaffirmation-required',
      policy: 'recommend-review',
      message: 'This tracked file became effectively sensitive and can be reviewed without blocking generation.',
    });
  }
  return findings;
}

async function resolveOpenRequests(slug: string, resolvedAt: string, exceptId?: string): Promise<void> {
  const directory = requestDirectory(slug);
  if (!fs.existsSync(directory)) return;
  let changed = false;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(directory, entry.name);
    const request = readRequest(filePath);
    if (request.status !== 'open' || request.reviewRequestId === exceptId) continue;
    writeRequest(filePath, {
      ...request,
      status: 'resolved',
      updatedAt: resolvedAt,
      resolvedAt,
    });
    changed = true;
  }
  if (changed) await commitReviewRequests(slug, `resolve Bundle Boundary Review Requests for ${slug}`);
}

export function describeSensitivityCause(filter: CustomFilterConfig, cause?: { filterId: string; event: 'created' | 'enabled' | 'edited' }): string {
  const name = `${filter.scope === 'global' ? 'Global' : 'Bundle'} filter “${filter.name}”`;
  if (cause?.filterId !== filter.id) return `${name} marks this node sensitive.`;
  return `${name} ${cause.event === 'created' ? 'was added and marks this node sensitive.'
    : cause.event === 'enabled' ? 'was enabled for this bundle and marks this node sensitive.'
    : 'was edited and now marks this node sensitive.'}`;
}

export async function assessBundleBoundary(slug: string, policyChange?: { filterId: string; event: 'created' | 'enabled' | 'edited'; previousFilters: CustomFilterConfig[] }): Promise<{
  reviewRequest: BundleBoundaryReviewRequest | null;
  reviewRequired: boolean;
  assessmentIncomplete?: string;
}> {
  const policyChangeRequest = policyChange !== undefined;
  if (policyChange) pendingPolicyChanges.set(slug, policyChange);
  policyChange ??= pendingPolicyChanges.get(slug);
  const loaded = await loadWorkingGraph({ bundleSlug: slug });
  if (loaded.draftNodes) throw new Error('Save or undo pending curation changes before generation');
  applySensitiveFromApiData(loaded.nodes);
  applyNodeConfigsToNodes(loaded.nodes, loaded.committedNodes);
  const graph = new Graph();
  loaded.nodes.forEach(node => graph.addNode(node));
  loaded.edges.forEach(edge => graph.addEdge(edge));
  graph.setLinkSourceData(loaded.allInlinkSources, loaded.allOutlinkTargets);
  let effectivelySensitive: Set<IBundleNode['bundleNodeKey']>;
  try { effectivelySensitive = selectEffectivelySensitiveNodeKeys(graph, loadCustomFiltersForBundle(slug), false, new Set(loaded.nodes.filter(node => node.tracked).map(node => node.bundleNodeKey))); }
  catch (error) {
    if (error instanceof CommandFilterIncompleteError && policyChangeRequest) return { reviewRequest: null, reviewRequired: true, assessmentIncomplete: error.message };
    throw error;
  }
  pendingPolicyChanges.delete(slug);
  const sourceDirectory = acceptedSourceRoot(getBundleDirectory(slug));
  if (!sourceDirectory) throw new Error(`Bundle '${slug}' has no source directory`);

  const findings: BundleBoundaryFinding[] = [];
  const nodesById = new Map(loaded.nodes.flatMap(node => node.bundleNodeId ? [[node.bundleNodeId, node] as const] : []));
  const records = loadTrackingRecords(getBundleDirectory(slug));
  const previousSensitivity = policyChange ? selectEffectivelySensitiveNodeKeys(graph, policyChange.previousFilters, true) : undefined;
  let recordedCause = false;
  const filters = loadCustomFiltersForBundle(slug).filter(filter => filter.enabled && filter.actions.some(action => action.type === 'mark_sensitive'));
  const matches = filters.map(filter => ({ filter, keys: selectEffectivelySensitiveNodeKeys(graph, [filter], true) }));
  for (const config of loaded.committedNodes) {
    if (config.listType !== 'whitelist') continue;
    const node = nodesById.get(config.bundleNodeId) ?? loaded.nodes.find(candidate => nodeConfigMatchesNode(
      config, candidate.bundleNodeName, candidate.sourceGraphSubdirectory, candidate.fileType,
      candidate.bundleNodeKind, candidate.bundleNodeId, candidate.sourceId,
    ));
    if (!node) continue;
    const sensitive = effectivelySensitive.has(node.bundleNodeKey);
    const record = records[config.bundleNodeId] ?? {};
    const recorded = record.sensitivity?.effectivelySensitive ?? record.evidence?.effectivelySensitive
      ?? (config.bundleNodeKind === 'file' ? config.trackingEvidence?.effectivelySensitive : undefined);
    const digest = config.bundleNodeKind === 'file' ? currentSourceContentDigest(sourceDirectory, config) : undefined;
    if (config.bundleNodeKind === 'file' && config.trackingEvidence && digest) {
      findings.push(...deriveTrackingEvidenceFindings({ config, node, sourceContentDigest: digest, effectivelySensitive: sensitive })
        .filter(finding => finding.code === 'content-changed-since-tracking'));
    }
    if (sensitive && recorded !== true) {
      if (policyChange && !previousSensitivity?.has(node.bundleNodeKey) && matches.some(item => item.filter.id === policyChange.filterId && item.keys.has(node.bundleNodeKey))) {
        record.sensitivityCause = { filterId: policyChange.filterId, event: policyChange.event, observedAt: new Date().toISOString() };
        records[config.bundleNodeId] = record;
        recordedCause = true;
      }
      const reasons = [
        ...(node.sensitive ? ['The accepted source marks this node sensitive.'] : []),
        ...matches.filter(item => item.keys.has(node.bundleNodeKey) ).map(({ filter }) =>
          describeSensitivityCause(filter, record.sensitivityCause)),
      ];
      findings.push({ bundleNodeId: config.bundleNodeId, bundleNodeKey: node.bundleNodeKey,
        bundleNodeName: node.bundleNodeName, code: 'sensitivity-reaffirmation-required', policy: 'recommend-review',
        ...(digest && { sourceContentDigest: digest }),
        recordedSourceContentDigest: record.evidence?.sourceContentDigest, effectivelySensitive: true,
        recordedEffectivelySensitive: recorded, sensitivityReasons: reasons,
        message: `This tracked node is now sensitive. ${reasons.join(' ')}` });
    }
  }
  if (recordedCause) saveTrackingRecords(getBundleDirectory(slug), records);
  findings.sort((left, right) => left.bundleNodeId.localeCompare(right.bundleNodeId)
    || left.code.localeCompare(right.code));

  const now = new Date().toISOString();
  if (findings.length === 0) {
    await resolveOpenRequests(slug, now);
    return { reviewRequest: null, reviewRequired: false };
  }

  const reviewRequestId = requestId(slug, findings);
  await resolveOpenRequests(slug, now, reviewRequestId);
  const filePath = requestPath(slug, reviewRequestId);
  const prior = fs.existsSync(filePath) ? readRequest(filePath) : null;
  const next: BundleBoundaryReviewRequest = {
    schemaVersion: BUNDLE_BOUNDARY_REVIEW_SCHEMA_VERSION,
    reviewRequestId,
    slug,
    status: 'open',
    policy: 'recommend-review',
    createdAt: prior?.createdAt ?? now,
    updatedAt: prior?.updatedAt ?? now,
    // The link selects the pages under review in the bundle editor.
    deepLinkPath: appPlacePath({ page: 'bundle', slug, ...(findings.some(finding => finding.code === 'sensitivity-reaffirmation-required') && { editorMode: 'sourcing' as const, surface: { name: 'source-review', parameters: { review: 'sensitivity' } } }), select: findings.map(finding => ({ id: finding.bundleNodeId })) }),
    findings,
  };
  if (!prior || !sameReviewState(prior, next)) {
    next.updatedAt = now;
    writeRequest(filePath, next);
    await commitReviewRequests(slug, `record Bundle Boundary Review Request ${reviewRequestId}`);
  }
  return { reviewRequest: prior && sameReviewState(prior, next) ? prior : next, reviewRequired: false };
}

export function findBundleBoundaryReviewRequest(reviewRequestId: string): BundleBoundaryReviewRequest | null {
  if (!REVIEW_REQUEST_ID_PATTERN.test(reviewRequestId)) return null;
  const bundlesDirectory = getBundlesDirectory();
  if (!fs.existsSync(bundlesDirectory)) return null;
  for (const entry of fs.readdirSync(bundlesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const filePath = requestPath(entry.name, reviewRequestId);
    if (fs.existsSync(filePath)) return readRequest(filePath);
  }
  return null;
}

import type { ParticipatesIn, changesSinceTracking } from '../../../../../concepts/index.js';
export type ChangesSinceTrackingMeadowConceptParticipations = [
  ParticipatesIn<typeof changesSinceTracking, 'assess-changes', typeof assessBundleBoundary>,
];
