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
import type {
  GeneratedBundleVersionId,
  PredecessorCleanupPolicy,
  ReaderConnectionToPredecessor,
} from '../../../../../../contracts/types/generatedBundleVersioning.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../../shared_code/utils/appConfigGitUtils.js';
import {
  isPlainObject,
  jsonDocumentCodec,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from '../../../../../../shared_code/utils/durableDocument.js';
import {
  createNewGeneratedBundleVersion,
  generateCurrentBundleVersion,
} from '../../../shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';
import { requireBundleRenameGenerationOperations } from '../../../shared/bundle-management/bundleRenameWorkflowHost.js';
import {
  generatedBundleVersionDirectory,
  loadGeneratedBundleVersionManifest,
  saveGeneratedBundleVersionManifest,
} from '../../../shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { inspectGeneratedVersionGitState } from '../../../shared/generated-bundle-versioning/generatedBundleVersionGitService.js';
import { getAllBackendProviders } from '../../../shared/publishing-provider-host/providerRegistry.js';
import type { BundleRenamePublicationPlan } from '../../../shared/publishing-provider-host/IPublishingProviderBackend.js';
import { getBundleDirectory, getConfigDirectory } from '../../../shared/bundle-config/bundleConfigPaths.js';
import { loadBundleConfig } from '../../../shared/utils/bundleConfigUtils.js';
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
  const providers = getAllBackendProviders().flatMap(provider => {
    const plan = provider.getBundleRenamePublicationPlan?.(bundleSlug) ?? null;
    return plan ? [plan] : [];
  });
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
    const config = loadBundleConfig(newDirectory);
    const generation = requireBundleRenameGenerationOperations();
    if (config.sourceDirectory) await generation.refreshTrackedContent(newDirectory, config.sourceDirectory);
    let versionId: string | null = current?.versionId ?? null;
    let createdVersion = false;
    if (current) {
      const generated = plan.providers.length > 0
        ? await createNewGeneratedBundleVersion(newDirectory, {
          notes: `Bundle renamed from ${bundleSlug} to ${newSlug}`,
          confirmedNoGeneratedChanges: true,
          generate: stagingDirectory => generation.generateHtml(newDirectory, stagingDirectory),
        })
        : await generateCurrentBundleVersion(newDirectory, {
          generate: stagingDirectory => generation.generateHtml(newDirectory, stagingDirectory),
        });
      versionId = generated.versionId;
      createdVersion = generated.created && plan.providers.length > 0;
      if (createdVersion) createdVersionId = generated.versionId;
    }

    if (createdVersion && versionId) {
      for (const providerPlan of plan.providers) {
        const decision = decisions.find(item => item.providerId === providerPlan.providerId)!;
        const provider = getAllBackendProviders().find(item => item.manifest.id === providerPlan.providerId);
        if (!provider?.prepareBundleRenamePublication) {
          throw new Error(`${providerPlan.providerDisplayName} cannot prepare a bundle rename`);
        }
        attemptedProviders.push(providerPlan);
        await provider.prepareBundleRenamePublication({
          bundleSlug: newSlug,
          generatedVersionId: versionId as GeneratedBundleVersionId,
          publishSlug: decision.publishSlug,
          readerConnectionToPredecessor: decision.readerConnectionToPredecessor,
          predecessorCleanupPolicy: decision.predecessorCleanupPolicy,
        });
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
          const provider = getAllBackendProviders().find(item => item.manifest.id === providerPlan.providerId);
          await provider?.cancelPendingBundleRenamePublication?.(newSlug, providerPlan.currentPublishSlug);
        } catch {
          // The original operation error remains authoritative; the folder and
          // generated-version rollback below still preserve the user's bundle.
        }
      }
      if (createdVersionId) {
        fs.rmSync(generatedBundleVersionDirectory(newDirectory, createdVersionId), { recursive: true, force: true });
        saveGeneratedBundleVersionManifest(newDirectory, manifest);
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
    const provider = getAllBackendProviders().find(item => item.manifest.id === providerSlug.providerId);
    const providerPlan = provider?.getBundleRenamePublicationPlan?.(bundleSlug);
    if (providerPlan && providerPlan.currentPublishSlug !== providerSlug.previousPublishSlug
      && providerPlan.currentPublicUrl?.includes(`-${providerPlan.currentPublishSlug}-`)) {
      throw new Error(`The rename has already been published by ${providerPlan.providerDisplayName}`);
    }
    await provider?.cancelPendingBundleRenamePublication?.(bundleSlug, providerSlug.previousPublishSlug);
  }
  fs.rmSync(generatedBundleVersionDirectory(bundleDirectory, marker.createdVersionId), { recursive: true, force: true });
  saveGeneratedBundleVersionManifest(bundleDirectory, { ...manifest, versions: manifest.versions.slice(0, -1) });
  fs.rmSync(markerPath(bundleDirectory), { force: true });
  fs.renameSync(bundleDirectory, previousDirectory);
  clearBundleGuidCache(bundleSlug);
  clearBundleGuidCache(marker.previousSlug);
  await commitBundleMove(`undo bundle rename from ${bundleSlug} to ${marker.previousSlug}`);
  const currentVersionId = manifest.versions.at(-2)?.versionId ?? null;
  logBundleInfo(marker.previousSlug, `Undid pending bundle rename from ${bundleSlug}`);
  return { slug: marker.previousSlug, versionId: currentVersionId };
}
