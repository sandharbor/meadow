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

import type {
  GeneratedBundleVersionId,
  GeneratedBundleVersionManifest,
} from '../../../../../shared_code/types/generatedBundleVersioning.js';

/**
 * Finds each remotely present version's furthest-forward connected publication.
 * Connected local versions that have not been published are traversed but never
 * selected, while a disconnected edge ends the lineage.
 */
export function computePublishedSuccessors(
  manifest: GeneratedBundleVersionManifest,
  remotelyPresentVersionIds: ReadonlySet<string>,
): Map<GeneratedBundleVersionId, GeneratedBundleVersionId> {
  const result = new Map<GeneratedBundleVersionId, GeneratedBundleVersionId>();
  for (let sourceIndex = 0; sourceIndex < manifest.versions.length; sourceIndex++) {
    const source = manifest.versions[sourceIndex];
    if (!remotelyPresentVersionIds.has(source.versionId)) continue;

    let successor: GeneratedBundleVersionId | null = null;
    for (let candidateIndex = sourceIndex + 1; candidateIndex < manifest.versions.length; candidateIndex++) {
      const candidate = manifest.versions[candidateIndex];
      if (candidate.readerConnectionToPredecessor === 'disconnected') break;
      if (remotelyPresentVersionIds.has(candidate.versionId)) successor = candidate.versionId;
    }
    if (successor) result.set(source.versionId, successor);
  }
  return result;
}
