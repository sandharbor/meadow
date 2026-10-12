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
import type { GeneratedBundleVersionId, ReaderConnectionToPredecessor } from '../../../../../../contracts/types/shared/generated-bundle-versioning/generatedBundleVersioning.js';
import type { PredecessorCleanupPolicy } from '../../../../../../contracts/types/shared/publishing-provider-host/publicationVersioning.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../../shared_code/utils/appConfigGitUtils.js';
import {
  isPlainObject,
  jsonDocumentCodec,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from '../../../../../../shared_code/utils/durableDocument.js';
import { discardUnsavedCurrentGeneratedBundleVersion } from '../../../shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';
import { requireBundleRenameGenerationOperations } from '../../../shared/bundle-management/bundleRenameWorkflowHost.js';
import { loadGeneratedBundleVersionManifest } from '../../../shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { inspectGeneratedVersionGitState } from '../../../shared/generated-bundle-versioning/generatedBundleVersionGitService.js';
import { bundlesQueryRenamePublicationPlans, bundlesCommandPrepareRenamePublication, bundlesCommandCancelRenamePublication, bundlesCommandUndoRenamePublication } from '../../bundle/sharing/exported.js';
import type { BundlesTypeRenamePublicationPlan as BundleRenamePublicationPlan } from '../../bundle/sharing/exported.js';
import { getBundleDirectory, getConfigDirectory } from '../../../shared/bundle-config/bundleConfigPaths.js';
import { clearBundleGuidCache, logBundleInfo } from '../../../shared/utils/logging/bundleLogger.js';

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const RENAME_MARKER = '.bundle-rename.json';

export interface BundleRenameProviderDecision {
  providerId: string;
  publishSlug: string;
  readerConnectionToPredecessor: ReaderConnectionToPredecessor;
  predecessorCleanupPolicy: PredecessorCleanupPolicy;
}

interface BundleRenameMarker {
  schemaVersion: 1;
  previousSlug: string;
  renamedSlug: string;
  createdVersionId: GeneratedBundleVersionId;
  providerSlugs: Array<{ providerId: string; previousPublishSlug: string }>;
}

const markerCodec = jsonDocumentCodec<BundleRenameMarker>(value => {
  if (!isPlainObject(value) || value.schemaVersion !== 1) return { valid: false, diagnostic: '$.schemaVersion must be 1' };
  if (typeof value.previousSlug !== 'string' || typeof value.renamedSlug !== 'string' || typeof value.createdVersionId !== 'string') {
    return { valid: false, diagnostic: '$ rename marker fields are invalid' };
  }
  if (!Array.isArray(value.providerSlugs)) return { valid: false, diagnostic: '$.providerSlugs must be an array' };
  return { valid: true, value: value as unknown as BundleRenameMarker };
});

function markerPath(bundleDirectory: string): string { return path.join(bundleDirectory, 'config', RENAME_MARKER); }

function hasUnsavedCuration(bundleDirectory: string): boolean {
  const draft = path.join(bundleDirectory, 'config', 'draft_bundle_node_config.yaml');
  const committed = path.join(bundleDirectory, 'config', 'bundle_node_config.yaml');
  return fs.existsSync(draft)
    && fs.readFileSync(draft, 'utf8') !== (fs.existsSync(committed) ? fs.readFileSync(committed, 'utf8') : '');
}

export function inspectBundleRename(bundleSlug: string): {
  bundleSlug: string;
  hasGeneratedVersion: boolean;
  willCreateGeneratedVersion: boolean;
  providers: BundleRenamePublicationPlan[];
} {
  const bundleDirectory = getBundleDirectory(bundleSlug);
  if (!fs.existsSync(bundleDirectory)) throw new Error(`Bundle '${bundleSlug}' not found`);
  const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
  const providers = bundlesQueryRenamePublicationPlans(bundleSlug);
  return {
    bundleSlug,
    hasGeneratedVersion: manifest.versions.length > 0,
    willCreateGeneratedVersion: providers.length > 0 && manifest.versions.length > 0,
    providers,
  };
}

async function commitBundleMove(message: string): Promise<void> {
  const git = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, getConfigDirectory());
  await git.commitDirs(['bundles'], message);
}

export async function renameBundle(
  bundleSlug: string,
  newSlug: string,
  decisions: BundleRenameProviderDecision[],
): Promise<{ slug: string; versionId: string | null; createdVersion: boolean; undoAvailable: boolean }> {
  if (!SLUG_PATTERN.test(newSlug)) throw new Error('Bundle slug must contain only lowercase letters, numbers, and dashes');
  if (newSlug === bundleSlug) throw new Error('Choose a different bundle slug');
  const oldDirectory = getBundleDirectory(bundleSlug);
  const newDirectory = getBundleDirectory(newSlug);
  if (!fs.existsSync(oldDirectory)) throw new Error(`Bundle '${bundleSlug}' not found`);
  if (fs.existsSync(newDirectory)) throw new Error(`Bundle '${newSlug}' already exists`);
  if (hasUnsavedCuration(oldDirectory)) throw new Error('Save or undo bundle curation changes before renaming');

  const plan = inspectBundleRename(bundleSlug);
  const manifest = loadGeneratedBundleVersionManifest(oldDirectory);
  const current = manifest.versions.at(-1) ?? null;
  if (current?.localFilesState === 'present') {
    const gitState = inspectGeneratedVersionGitState(oldDirectory, current.versionId);
    if (!gitState.isSaved || gitState.changes.length > 0) {
      throw new Error('Save or discard generated changes before renaming this bundle');
    }
  }
  for (const providerPlan of plan.providers) {
    const decision = decisions.find(item => typeof item.providerId === 'string' && item.providerId === providerPlan.providerId);
    if (!decision) throw new Error(`Choose publication behavior for ${providerPlan.providerDisplayName}`);
    if (typeof decision.publishSlug !== 'string' || !SLUG_PATTERN.test(decision.publishSlug)) {
      throw new Error(`Publish slug for ${providerPlan.providerDisplayName} is invalid`);
    }
    if (typeof decision.readerConnectionToPredecessor !== 'string'
      || !['connected', 'disconnected'].includes(decision.readerConnectionToPredecessor)) {
      throw new Error(`Reader behavior for ${providerPlan.providerDisplayName} is invalid`);
    }
    if (typeof decision.predecessorCleanupPolicy !== 'string'
      || !['keep', 'delete-after-success'].includes(decision.predecessorCleanupPolicy)) {
      throw new Error(`File retention for ${providerPlan.providerDisplayName} is invalid`);
    }
  }
  const expectedProviderIds = new Set(plan.providers.map(provider => provider.providerId));
  if (decisions.some(decision => !expectedProviderIds.has(decision.providerId))) {
    throw new Error('A provider decision does not belong to this bundle');
  }
  if (new Set(decisions.map(decision => decision.providerId)).size !== decisions.length) {
    throw new Error('Each provider may have only one rename decision');
  }

  const attemptedProviders: BundleRenamePublicationPlan[] = [];
  let createdVersionId: GeneratedBundleVersionId | null = null;
  fs.renameSync(oldDirectory, newDirectory);
  clearBundleGuidCache(bundleSlug);
  clearBundleGuidCache(newSlug);
  try {
    await commitBundleMove(`rename bundle ${bundleSlug} to ${newSlug}`);
    const generation = requireBundleRenameGenerationOperations();
    let versionId: string | null = current?.versionId ?? null;
    let createdVersion = false;
    if (current) {
      const generated = plan.providers.length > 0
        ? await generation.createSuccessorVersion(newDirectory, `Bundle renamed from ${bundleSlug} to ${newSlug}`)
        : await generation.regenerateCurrentVersion(newSlug, newDirectory);
      versionId = generated.versionId;
      createdVersion = generated.created && plan.providers.length > 0;
      if (createdVersion) createdVersionId = generated.versionId as GeneratedBundleVersionId;
    }

    if (createdVersion && versionId) {
      for (const providerPlan of plan.providers) {
        const decision = decisions.find(item => item.providerId === providerPlan.providerId)!;
        await bundlesCommandPrepareRenamePublication(providerPlan.providerId, {
          bundleSlug: newSlug,
          generatedVersionId: versionId as GeneratedBundleVersionId,
          publishSlug: decision.publishSlug,
          readerConnectionToPredecessor: decision.readerConnectionToPredecessor,
          predecessorCleanupPolicy: decision.predecessorCleanupPolicy,
        }, providerPlan.currentPublishSlug);
        attemptedProviders.push(providerPlan);
      }
      writeDurableDocument({
        path: markerPath(newDirectory),
        value: {
          schemaVersion: 1,
          previousSlug: bundleSlug,
          renamedSlug: newSlug,
          createdVersionId: versionId,
          providerSlugs: plan.providers.map(providerPlan => ({
            providerId: providerPlan.providerId,
            previousPublishSlug: providerPlan.currentPublishSlug,
          })),
        },
        codec: markerCodec,
      });
    }
    logBundleInfo(newSlug, `Bundle renamed from ${bundleSlug}; stable bundle identity preserved`);
    return { slug: newSlug, versionId, createdVersion, undoAvailable: createdVersion };
  } catch (error) {
    if (fs.existsSync(newDirectory)) {
      for (const providerPlan of attemptedProviders.reverse()) {
        try {
          await bundlesCommandCancelRenamePublication(providerPlan.providerId, newSlug, providerPlan.currentPublishSlug);
        } catch {
          // The original operation error remains authoritative; the folder and
          // generated-version rollback below still preserve the user's bundle.
        }
      }
      if (createdVersionId) {
        await discardUnsavedCurrentGeneratedBundleVersion(newDirectory, createdVersionId, manifest);
        fs.rmSync(markerPath(newDirectory), { force: true });
      }
    }
    if (fs.existsSync(newDirectory) && !fs.existsSync(oldDirectory)) fs.renameSync(newDirectory, oldDirectory);
    clearBundleGuidCache(bundleSlug);
    clearBundleGuidCache(newSlug);
    await commitBundleMove(`roll back failed bundle rename from ${bundleSlug} to ${newSlug}`);
    throw error;
  }
}

export function hasPendingBundleRename(bundleSlug: string): boolean {
  return fs.existsSync(markerPath(getBundleDirectory(bundleSlug)));
}

export async function undoPendingBundleRename(bundleSlug: string): Promise<{ slug: string; versionId: string | null }> {
  const bundleDirectory = getBundleDirectory(bundleSlug);
  const loaded = readDurableDocument(markerPath(bundleDirectory), markerCodec);
  const marker = requireValidDocument(loaded, () => { throw new Error('This bundle has no pending rename'); });
  const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
  if (manifest.versions.at(-1)?.versionId !== marker.createdVersionId) {
    throw new Error('The rename-created version is no longer current');
  }
  const previousDirectory = getBundleDirectory(marker.previousSlug);
  if (fs.existsSync(previousDirectory)) throw new Error(`Bundle '${marker.previousSlug}' already exists`);
  for (const providerSlug of marker.providerSlugs) {
    await bundlesCommandUndoRenamePublication(providerSlug.providerId, bundleSlug, providerSlug.previousPublishSlug);
  }
  await discardUnsavedCurrentGeneratedBundleVersion(
    bundleDirectory,
    marker.createdVersionId,
    { ...manifest, versions: manifest.versions.slice(0, -1) },
  );
  fs.rmSync(markerPath(bundleDirectory), { force: true });
  fs.renameSync(bundleDirectory, previousDirectory);
  clearBundleGuidCache(bundleSlug);
  clearBundleGuidCache(marker.previousSlug);
  await commitBundleMove(`undo bundle rename from ${bundleSlug} to ${marker.previousSlug}`);
  const currentVersionId = manifest.versions.at(-2)?.versionId ?? null;
  logBundleInfo(marker.previousSlug, `Undid pending bundle rename from ${bundleSlug}`);
  return { slug: marker.previousSlug, versionId: currentVersionId };
}
