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

import { API_BASE_URL } from './apiConfig';
import type { SiteConfig } from '../../../shared_code/types/siteConfig';

/**
 * Site config with slug included (as returned by the API). Provider-specific
 * fields are not merged in — callers needing e.g. a published URL use the
 * active publishing provider's frontend module instead.
 */
export interface SiteConfigWithSlug extends SiteConfig {
  slug: string;
  error?: string;
}

/**
 * Data needed for the edit site modal
 */
export interface SiteEditData {
  slug: string;
  sourceDirectory: string;
  initialSitePageTitle: string;
  initialSitePageDirectory: string;
  siteNotes: string;
}

/**
 * Fetches all sites with their full configuration
 */
export async function fetchSites(): Promise<SiteConfigWithSlug[]> {
  const response = await fetch(`${API_BASE_URL}/sites-detailed`);
  if (!response.ok) {
    throw new Error('Failed to fetch sites');
  }
  return response.json();
}

/**
 * Fetches a single site's configuration by slug
 */
export async function fetchSiteBySlug(slug: string): Promise<SiteConfigWithSlug> {
  const sites = await fetchSites();
  const site = sites.find(s => s.slug === slug);
  if (!site) {
    throw new Error(`Site "${slug}" not found`);
  }
  return site;
}

/**
 * Fetches the list of available source directories
 */
export async function fetchDirectories(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/sites/directories`);
  if (!response.ok) {
    throw new Error('Failed to fetch directories');
  }
  return response.json();
}

/**
 * Fetches all data needed for the edit site modal.
 * Returns the site's edit data and the list of available directories.
 */
export async function fetchSiteEditData(slug: string): Promise<{
  siteEditData: SiteEditData;
  directories: string[];
}> {
  const [site, directories] = await Promise.all([
    fetchSiteBySlug(slug),
    fetchDirectories()
  ]);

  return {
    siteEditData: {
      slug: site.slug,
      sourceDirectory: site.sourceDirectory || '',
      initialSitePageTitle: site.initialSitePageTitle || '',
      initialSitePageDirectory: site.initialSitePageDirectory || '',
      siteNotes: site.siteNotes || ''
    },
    directories
  };
}
