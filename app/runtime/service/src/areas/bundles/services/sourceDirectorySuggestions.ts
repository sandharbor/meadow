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

import path from 'path';

export interface BundleSourceDirectoryCandidate {
  slug: string;
  sourceDirectory?: string;
  bundleCreatedAt?: string;
  bundleUpdatedAt?: string;
  configModifiedAtMs?: number;
  createdFromExample?: boolean;
}

const exampleBundleSlugPattern = /^example-bundle(?:-\d+)?$/;

function isLegacyGeneratedExample(
  candidate: BundleSourceDirectoryCandidate,
  configDirectory: string,
): boolean {
  if (!candidate.sourceDirectory || !exampleBundleSlugPattern.test(candidate.slug)) return false;
  const generatedDirectoryName = `${candidate.slug.replace(/-/g, '_')}_source_graph`;
  return path.resolve(candidate.sourceDirectory) === path.resolve(configDirectory, generatedDirectoryName);
}

function recency(candidate: BundleSourceDirectoryCandidate): number {
  for (const value of [candidate.bundleCreatedAt, candidate.bundleUpdatedAt]) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return candidate.configModifiedAtMs ?? 0;
}

/**
 * Returns user source directories in most-recently-created order. Generated
 * example content is deliberately omitted so it never becomes a creation
 * default or a reusable suggestion.
 */
export function sourceDirectorySuggestions(
  candidates: BundleSourceDirectoryCandidate[],
  configDirectory: string,
): string[] {
  const ordered = candidates
    .filter(candidate => candidate.sourceDirectory)
    .filter(candidate => !candidate.createdFromExample && !isLegacyGeneratedExample(candidate, configDirectory))
    .sort((first, second) => recency(second) - recency(first));

  const directories = new Set<string>();
  for (const candidate of ordered) directories.add(candidate.sourceDirectory!);
  return Array.from(directories);
}
