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

import type { ComponentType } from 'react';
import type { PublishingProviderManifest } from '../../../shared_code/interfaces/IPublishingProvider.js';

/**
 * Props handed to a provider's publish-tab component. The outer modal stays
 * responsible for preview generation, tab navigation, and save-changes; the
 * provider's tab owns everything that is specific to publishing to a
 * particular destination (auth, permissions, upload, delete, etc.).
 */
export interface PublishTabProps {
  siteSlug: string;
  changedFilesCount: number;
  onBusyChange: (busy: boolean) => void;
  onAuthError: () => void;
  onPublishSuccess?: () => void;
  onViewChanges: () => void;
  retryPublishTrigger?: number;
}

/**
 * Frontend contract for a publishing provider. `PublishTabComponent` and the
 * site-scoped query methods are optional so a provider can register itself
 * (and show up in provider-aware UI) before those capabilities are
 * implemented — the core UI falls back gracefully when a method is missing.
 *
 * All query methods resolve on success and throw on failure with a
 * human-readable message. Callers wrap calls in try/catch when they want
 * to surface the error in the UI.
 */
export interface IPublishingProviderFrontend {
  readonly manifest: PublishingProviderManifest;
  readonly PublishTabComponent?: ComponentType<PublishTabProps>;

  /**
   * Resolve to the currently-published URL for the given site (optionally
   * for a specific version). Throws if the site has not been published or
   * the provider cannot produce a URL.
   */
  readonly fetchPublishedUrl?: (siteSlug: string, versionId?: string) => Promise<string>;

  /**
   * Resolve to how many HTML pages and other files are currently published
   * for the given site. Used by UI that wants to warn the user before
   * destructive actions (e.g. deleting a site).
   */
  readonly fetchPublishedFileCounts?: (siteSlug: string) => Promise<{ htmlCount: number; otherCount: number }>;

  /**
   * Publish a new version snapshot of the site. Resolves on success, throws
   * with a descriptive message on failure. Providers that don't support
   * versioning simply don't implement this method.
   */
  readonly publishNewVersion?: (
    siteSlug: string,
    notes: string,
    addPointersToOlderVersions: boolean,
  ) => Promise<void>;
}
