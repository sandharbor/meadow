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

import { apiJson } from './apiClient';
import type { BundleConfig } from '../../../../shared_code/types/bundleConfig';

/**
 * Bundle config with slug included (as returned by the API). Provider-specific
 * fields are not merged in — callers needing e.g. a published URL use the
 * active publishing provider's frontend module instead.
 */
export interface BundleConfigWithSlug extends BundleConfig {
  slug: string;
  generatedVersionCount?: number;
  mostRecentPublicationAt?: string | null;
  hasRemotePublications?: boolean;
  entryBundleNodeName?: string;
  entrySourceGraphSubdirectory?: string;
  entryFileType?: string;
  error?: string;
  folderDerived?: boolean;
  repairRequired?: boolean;
  missingSelectedFolders?: Array<{
    bundleNodeId: string;
    bundleNodeName: string;
    sourceGraphSubdirectory: string;
    role: 'entry' | 'collectionMember';
    reason: 'missing' | 'notDirectory' | 'symlinkOrEscape';
  }>;
}

/**
 * Data needed for the edit bundle modal
 */
export interface BundleEditData {
  slug: string;
  sourceDirectory: string;
  entryBundleNodeName: string;
  entrySourceGraphSubdirectory: string;
  entryFileType?: string;
  bundleNotes: string;
  folderDerived: boolean;
  defaultOutlinksDepth?: number;
  defaultInlinksDepth?: number;
}

/**
 * Fetches all bundles with their full configuration
 */
export async function fetchBundles(): Promise<BundleConfigWithSlug[]> {
  return apiJson<BundleConfigWithSlug[]>('bundles/detailed');
}

/**
 * Fetches a single bundle's configuration by slug
 */
export async function fetchBundleBySlug(slug: string): Promise<BundleConfigWithSlug> {
  const bundles = await fetchBundles();
  const bundle = bundles.find(s => s.slug === slug);
  if (!bundle) {
    throw new Error(`Bundle "${slug}" not found`);
  }
  return bundle;
}

/**
 * Fetches the list of available source directories
 */
export async function fetchDirectories(): Promise<string[]> {
  return apiJson<string[]>('bundles/directories');
}

/**
 * Fetches all data needed for the edit bundle modal.
 * Returns the bundle's edit data and the list of available directories.
 */
export async function fetchBundleEditData(slug: string): Promise<{
  bundleEditData: BundleEditData;
  directories: string[];
}> {
  const [bundle, directories] = await Promise.all([
    fetchBundleBySlug(slug),
    fetchDirectories()
  ]);

  return {
    bundleEditData: {
      slug: bundle.slug,
      sourceDirectory: bundle.sourceDirectory || '',
      entryBundleNodeName: bundle.entryBundleNodeName || '',
      entrySourceGraphSubdirectory: bundle.entrySourceGraphSubdirectory || '',
      entryFileType: bundle.entryFileType,
      bundleNotes: bundle.bundleNotes || '',
      folderDerived: bundle.folderDerived === true,
      defaultOutlinksDepth: bundle.defaultOutlinksDepth,
      defaultInlinksDepth: bundle.defaultInlinksDepth,
    },
    directories
  };
}
