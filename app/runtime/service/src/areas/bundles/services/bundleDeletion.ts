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

import type { IPublishingProviderBackend } from '../../../shared/publishing-provider-host/IPublishingProviderBackend.js';

export async function deleteLocalBundleOnlyAfterProviderCleanup(options: {
  bundleSlug: string;
  operationId: string;
  providers: readonly IPublishingProviderBackend[];
  onProviderProgress: (progress: { stage: string; message: string }) => void;
  deleteLocalBundle: () => void;
}): Promise<void> {
  for (const provider of options.providers) {
    if (!provider.isBundlePublished?.(options.bundleSlug)) continue;
    if (!provider.cleanupPublishedBundle) {
      throw new Error(`${provider.manifest.displayName} cannot confirm remote cleanup`);
    }
    const result = await provider.cleanupPublishedBundle({
      bundleSlug: options.bundleSlug,
      operationId: options.operationId,
      onProgress: options.onProviderProgress,
    });
    if (result.confirmed !== true) {
      throw new Error(`${provider.manifest.displayName} did not confirm remote cleanup`);
    }
  }
  options.deleteLocalBundle();
}
