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

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  BUNDLE_BOUNDARY_REVIEW_SCHEMA_VERSION,
  type BundleBoundaryFinding,
  type BundleBoundaryReviewRequest,
} from '../../../../../contracts/types/bundleBoundaryReview.js';
import { Graph } from '../../../../../contracts/types/graph.js';
import type { FileBundleNodeConfig } from '../../../../../contracts/types/bundleNodeConfig.js';
import type { IBundleNode } from '../../../../../contracts/types/IBundleNode.js';
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
import { selectEffectivelySensitiveNodeKeys } from '../bundle-graph/graphFilterService.js';
import { loadWorkingGraph } from '../bundle-graph/workingGraphService.js';

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
  await git.commitDirs([`bundles/${slug}/review/requests`], message);
}

function sameReviewState(
  left: BundleBoundaryReviewRequest,
  right: BundleBoundaryReviewRequest,
): boolean {
  return JSON.stringify({ status: left.status, policy: left.policy, findings: left.findings })
    === JSON.stringify({ status: right.status, policy: right.policy, findings: right.findings });
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
      policy: 'review-required',
      message: 'This tracked file became effectively sensitive and must be explicitly reaffirmed before generation.',
    });
  }
  return findings;
}

async function resolveOpenRequests(slug: string, resolvedAt: string): Promise<void> {
  const directory = requestDirectory(slug);
  if (!fs.existsSync(directory)) return;
  let changed = false;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(directory, entry.name);
    const request = readRequest(filePath);
    if (request.status !== 'open') continue;
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

export async function assessBundleBoundary(slug: string): Promise<{
  reviewRequest: BundleBoundaryReviewRequest | null;
  reviewRequired: boolean;
}> {
  const loaded = await loadWorkingGraph({ bundleSlug: slug });
  if (loaded.draftNodes) throw new Error('Save or undo pending curation changes before generation');
  applySensitiveFromApiData(loaded.nodes);
  applyNodeConfigsToNodes(loaded.nodes, loaded.committedNodes);
  const graph = new Graph();
  loaded.nodes.forEach(node => graph.addNode(node));
  loaded.edges.forEach(edge => graph.addEdge(edge));
  graph.setLinkSourceData(loaded.allInlinkSources, loaded.allOutlinkTargets);
  const effectivelySensitive = selectEffectivelySensitiveNodeKeys(
    graph,
    loadCustomFiltersForBundle(slug),
  );
  const sourceDirectory = loaded.bundleConfig.sourceDirectory;
  if (!sourceDirectory) throw new Error(`Bundle '${slug}' has no source directory`);

  const findings: BundleBoundaryFinding[] = [];
  for (const config of loaded.committedNodes) {
    if (config.bundleNodeKind !== 'file' || config.listType !== 'whitelist' || !config.trackingEvidence) continue;
    const node = loaded.nodes.find(candidate => nodeConfigMatchesNode(
      config,
      candidate.bundleNodeName,
      candidate.sourceGraphSubdirectory,
      candidate.fileType,
      candidate.bundleNodeKind,
      candidate.bundleNodeId,
    ));
    if (!node) continue;
    const digest = currentSourceContentDigest(sourceDirectory, config);
    const sensitive = effectivelySensitive.has(node.bundleNodeKey);
    findings.push(...deriveTrackingEvidenceFindings({
      config,
      node,
      sourceContentDigest: digest,
      effectivelySensitive: sensitive,
    }));
  }
  findings.sort((left, right) => left.bundleNodeId.localeCompare(right.bundleNodeId)
    || left.code.localeCompare(right.code));

  const now = new Date().toISOString();
  if (findings.length === 0) {
    await resolveOpenRequests(slug, now);
    return { reviewRequest: null, reviewRequired: false };
  }

  const reviewRequestId = requestId(slug, findings);
  const filePath = requestPath(slug, reviewRequestId);
  const prior = fs.existsSync(filePath) ? readRequest(filePath) : null;
  const reviewRequired = findings.some(finding => finding.policy === 'review-required');
  const next: BundleBoundaryReviewRequest = {
    schemaVersion: BUNDLE_BOUNDARY_REVIEW_SCHEMA_VERSION,
    reviewRequestId,
    slug,
    status: 'open',
    policy: reviewRequired ? 'review-required' : 'recommend-review',
    createdAt: prior?.createdAt ?? now,
    updatedAt: prior?.updatedAt ?? now,
    deepLinkPath: `/bundle/${encodeURIComponent(slug)}?reviewRequestId=${encodeURIComponent(reviewRequestId)}`,
    findings,
  };
  if (!prior || !sameReviewState(prior, next)) {
    next.updatedAt = now;
    writeRequest(filePath, next);
    await commitReviewRequests(slug, `record Bundle Boundary Review Request ${reviewRequestId}`);
  }
  return { reviewRequest: prior && sameReviewState(prior, next) ? prior : next, reviewRequired };
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
