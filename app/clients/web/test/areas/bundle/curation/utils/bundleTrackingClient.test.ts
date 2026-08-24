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

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mutateFileTracking,
  trackSafeNodeKeys,
} from '../../../../../src/areas/bundle/curation/utils/bundleTrackingClient';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function successfulFetch() {
  const fetch = vi.fn(async (
    _input: Parameters<typeof globalThis.fetch>[0],
    _init?: Parameters<typeof globalThis.fetch>[1],
  ) => new globalThis.Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('Web bundle tracking client', () => {
  it('uses the one-file Runtime command with explicit sensitive inclusion', async () => {
    const fetch = successfulFetch();

    await mutateFileTracking({
      bundleSlug: 'private-notes',
      bundleNodeKey: '/Personal.md',
      operation: 'track',
      includeSensitive: true,
    });

    const [requestPath, request] = fetch.mock.calls[0];
    expect(requestPath).toBe('/api/bundles/private-notes/curation/node/track');
    expect(JSON.parse(String(request?.body))).toEqual({
      path: '/Personal.md',
      includeSensitive: true,
    });
  });

  it('keeps safe multi-node tracking on the conservative bulk command', async () => {
    const fetch = successfulFetch();

    await trackSafeNodeKeys('garden', ['/Public.md']);

    const [requestPath, request] = fetch.mock.calls[0];
    expect(requestPath).toBe('/api/bundles/garden/curation/track-nodes');
    expect(JSON.parse(String(request?.body))).toEqual({ nodeKeys: ['/Public.md'] });
  });
});
