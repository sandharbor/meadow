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
import os from 'os';
import path from 'path';
import type { GeneratedBundleVersionId } from '../../../../../../../contracts/types/generatedBundleVersioning.js';
import { requireGeneratedBundleVersionId } from '../../../../shared/generated-bundle-versioning/generatedBundleVersionDomain.js';
import {
  generatedBundleVersionDirectory,
  loadGeneratedBundleVersionManifest,
} from '../../../../shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { assertFrozenGeneratedVersionsIntegrity } from '../../../../shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';
import { inspectGeneratedVersionGitState } from '../../../../shared/generated-bundle-versioning/generatedBundleVersionGitService.js';
import { computePublishedSuccessors } from '../../../../shared/generated-bundle-versioning/readerSuccessors.js';

function readerRoute(bundleDirectory: string, versionId: GeneratedBundleVersionId): {
  routeIndex: string;
  entryPath: string;
} {
  const relativeDirectory = path.posix.join('_mw_assets', 'versioning');
  const assetDirectory = path.join(
    generatedBundleVersionDirectory(bundleDirectory, versionId),
    ...relativeDirectory.split('/'),
  );
  const files = fs.readdirSync(assetDirectory).filter(name => /^routes\.[a-f0-9]+\.json$/.test(name));
  if (files.length !== 1) throw new Error(`Version ${versionId} must contain exactly one reader route index`);
  const index = JSON.parse(fs.readFileSync(path.join(assetDirectory, files[0]), 'utf8')) as {
    schemaVersion?: number;
    entryPath?: unknown;
  };
  if (index.schemaVersion !== 1 || typeof index.entryPath !== 'string') {
    throw new Error(`Version ${versionId} reader route index is invalid`);
  }
  return { routeIndex: path.posix.join(relativeDirectory, files[0]), entryPath: index.entryPath };
}

function assertVersionSaved(bundleDirectory: string, versionId: GeneratedBundleVersionId): void {
  const state = inspectGeneratedVersionGitState(bundleDirectory, versionId);
  if (!state.isSaved || !state.savedGenerationId) {
    throw new Error(`Save generated version ${versionId} before exporting it`);
  }
}

export function selectedVersionExportSource(
  bundleDirectory: string,
  rawVersionId: unknown,
): { versionId: GeneratedBundleVersionId; sourceDirectory: string } {
  const versionId = requireGeneratedBundleVersionId(rawVersionId);
  const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
  const entry = manifest.versions.find(candidate => candidate.versionId === versionId);
  if (!entry || entry.localFilesState === 'deleted') {
    throw new Error('The selected version is not locally present');
  }
  assertFrozenGeneratedVersionsIntegrity(bundleDirectory, manifest);
  assertVersionSaved(bundleDirectory, versionId);
  return { versionId, sourceDirectory: generatedBundleVersionDirectory(bundleDirectory, versionId) };
}

/** Build the provider-neutral HTTP-ready multi-version folder structure. */
export function stageAllVersionsExport(
  bundleDirectory: string,
  bundleSlug: string,
  readerConnectionToPredecessor: 'connected' | 'disconnected' = 'connected',
): { sourceDirectory: string; cleanup: () => void } {
  const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
  if (manifest.versions.length < 2) throw new Error('All Versions export requires at least two versions');
  assertFrozenGeneratedVersionsIntegrity(bundleDirectory, manifest);
  const presentIds = new Set<GeneratedBundleVersionId>();
  for (const entry of manifest.versions) {
    if (entry.localFilesState === 'present') {
      assertVersionSaved(bundleDirectory, entry.versionId);
      presentIds.add(entry.versionId);
    }
  }

  const stagingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-all-versions-export-'));
  try {
    for (const versionId of presentIds) {
      fs.cpSync(
        generatedBundleVersionDirectory(bundleDirectory, versionId),
        path.join(stagingDirectory, `${bundleSlug}-${versionId}`),
        { recursive: true },
      );
    }
    const exportManifest = {
      ...manifest,
      versions: manifest.versions.map((entry, index) => ({
        ...entry,
        readerConnectionToPredecessor: index === 0 ? 'disconnected' as const : readerConnectionToPredecessor,
      })),
    };
    const successors = computePublishedSuccessors(exportManifest, presentIds);
    const successorEntries = Object.fromEntries([...successors.entries()].map(([sourceId, successorId]) => {
      const route = readerRoute(bundleDirectory, successorId);
      return [sourceId, {
        versionId: successorId,
        versionRoot: `${bundleSlug}-${successorId}`,
        routeIndex: route.routeIndex,
        entryPath: route.entryPath,
      }];
    }));
    const packageManifest = {
      schemaVersion: 1,
      versions: manifest.versions.map(entry => ({
        versionId: entry.versionId,
        localFilesState: entry.localFilesState,
      })),
      successors: successorEntries,
    };
    fs.writeFileSync(
      path.join(stagingDirectory, `${bundleSlug}-versions.json`),
      `${JSON.stringify(packageManifest, null, 2)}\n`,
      'utf8',
    );
    return {
      sourceDirectory: stagingDirectory,
      cleanup: () => fs.rmSync(stagingDirectory, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}
