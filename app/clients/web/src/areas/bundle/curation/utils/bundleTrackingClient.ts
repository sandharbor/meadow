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

import { apiRequest } from '../../../../shared/utils/apiClient';

async function requireTrackingSuccess(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const body = await response.json().catch(() => ({})) as { error?: string };
  throw new Error(body.error || fallback);
}

export async function mutateFileTracking(options: {
  bundleSlug: string;
  bundleNodeKey: string;
  operation: 'track' | 'untrack';
  includeSensitive?: boolean;
}): Promise<void> {
  const response = await apiRequest(
    `bundles/${encodeURIComponent(options.bundleSlug)}/curation/node/${options.operation}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: options.bundleNodeKey,
        ...(options.operation === 'track'
          && options.includeSensitive
          && { includeSensitive: true }),
      }),
    },
  );
  await requireTrackingSuccess(response, `File ${options.operation} failed`);
}

export async function trackSafeNodeKeys(bundleSlug: string, nodeKeys: string[]): Promise<void> {
  const response = await apiRequest(
    `bundles/${encodeURIComponent(bundleSlug)}/curation/track-nodes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeKeys }),
    },
  );
  await requireTrackingSuccess(response, 'Batch tracking failed');
}
