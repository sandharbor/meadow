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

import type { Express } from 'express';
import type { PublishingProviderManifest } from '../../../shared_code/interfaces/IPublishingProvider.js';

/**
 * SSE-friendly progress shape for cleanup flows. The core delete-site-stream
 * forwards each progress event to the browser unchanged.
 */
export interface CleanupPublishedSiteProgress {
  stage: string;
  message: string;
  filesDeleted?: number;
  totalFiles?: number;
  version?: string;
}

export interface CleanupPublishedSiteResult {
  warning?: string;
}

export interface CleanupPublishedSiteOptions {
  siteSlug: string;
  onProgress: (progress: CleanupPublishedSiteProgress) => void;
}

/**
 * Backend contract for a publishing provider. Providers expose a default
 * export of this shape so the core registry can mount their routes, ask
 * whether a site has been published, and trigger cleanup on delete.
 *
 * Capability methods (`isSitePublished`, `cleanupPublishedSite`) are
 * optional so a provider can ship with a subset of behaviour — core
 * treats absent methods as "nothing to do".
 */
export interface IPublishingProviderBackend {
  readonly manifest: PublishingProviderManifest;

  /**
   * Mount the provider's HTTP routes onto the app. Called once at startup.
   */
  registerRoutes(app: Express): void;

  /**
   * Seed the provider's own pp_resources.yaml with infrastructure defaults
   * (DNS names, bucket names, etc.). Called once at startup, after
   * core resources are initialized, so the provider owns its own infra
   * config rather than leaking fields into core resources.yaml.
   */
  ensureResourcesInitialized?(configDir: string, isDev: boolean): void;

  /**
   * Whether this provider has artifacts for the given site that warrant a
   * cleanup pass on delete (remote files, cached state, etc.). Should return
   * false (not throw) when the site simply isn't published by this provider.
   */
  isSitePublished?(siteSlug: string): boolean;

  /**
   * Delete everything this provider published for the given site. Reports
   * progress via onProgress; resolves with an optional `warning` string for
   * non-fatal issues (expired auth, missing credentials, etc.) so the core
   * can still proceed with local deletion.
   */
  cleanupPublishedSite?(options: CleanupPublishedSiteOptions): Promise<CleanupPublishedSiteResult>;
}
