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
import type {
  MutateBundleNodeCliResult,
  TrackBundleNodesCliResult,
} from '../../../../../../../contracts/types/cliOperations';

async function requireTrackingSuccess<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (response.ok) return body;
  throw new Error(body.error || fallback);
}

export async function mutateFileTracking(options: {
  bundleSlug: string;
  bundleNodeKey: string;
  operation: 'track' | 'untrack';
  includeSensitive?: boolean;
}): Promise<MutateBundleNodeCliResult> {
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
  return requireTrackingSuccess<MutateBundleNodeCliResult>(response, `File ${options.operation} failed`);
}

export async function trackSafeNodeKeys(
  bundleSlug: string,
  nodeKeys: string[],
): Promise<TrackBundleNodesCliResult> {
  const response = await apiRequest(
    `bundles/${encodeURIComponent(bundleSlug)}/curation/track-nodes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeKeys }),
    },
  );
  return requireTrackingSuccess<TrackBundleNodesCliResult>(response, 'Batch tracking failed');
}
