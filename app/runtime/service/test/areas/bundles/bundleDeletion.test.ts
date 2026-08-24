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

import { describe, expect, it, vi } from 'vitest';
import type { IPublishingProviderBackend } from '../../../src/shared/publishing-provider-host/IPublishingProviderBackend.js';
import { deleteLocalBundleOnlyAfterProviderCleanup } from '../../../src/areas/bundles/services/bundleDeletion.js';

function provider(overrides: Partial<IPublishingProviderBackend>): IPublishingProviderBackend {
  return {
    manifest: { id: 'test-provider', displayName: 'Test Provider', publishTabLabel: 'Publish' },
    registerRoutes: vi.fn(),
    ...overrides,
  };
}

describe('bundle deletion provider gate', () => {
  it('D05 L02 preserves the complete local bundle and shares the retry operation ID when any provider cleanup fails', async () => {
    const deleteLocalBundle = vi.fn();
    const firstCleanup = vi.fn().mockResolvedValue({ confirmed: true });
    const secondCleanup = vi.fn().mockRejectedValue(new Error('credentials expired'));

    await expect(deleteLocalBundleOnlyAfterProviderCleanup({
      bundleSlug: 'example',
      operationId: 'op-delete-failure',
      providers: [
        provider({ isBundlePublished: () => true, cleanupPublishedBundle: firstCleanup }),
        provider({ isBundlePublished: () => true, cleanupPublishedBundle: secondCleanup }),
      ],
      onProviderProgress: vi.fn(),
      deleteLocalBundle,
    })).rejects.toThrow('credentials expired');

    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(secondCleanup).toHaveBeenCalledOnce();
    expect(firstCleanup).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'op-delete-failure' }));
    expect(secondCleanup).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'op-delete-failure' }));
    expect(deleteLocalBundle).not.toHaveBeenCalled();
  });

  it('P08 D04 retains every disconnected provider cleanup identity and deletes locally only after all confirm', async () => {
    const order: string[] = [];
    await deleteLocalBundleOnlyAfterProviderCleanup({
      bundleSlug: 'example',
      operationId: 'op-delete-success',
      providers: [
        provider({
          manifest: { id: 'active-provider', displayName: 'Active', publishTabLabel: 'Publish' },
          isBundlePublished: () => true,
          cleanupPublishedBundle: async () => {
            order.push('active-remote');
            return { confirmed: true };
          },
        }),
        provider({
          manifest: { id: 'disconnected-provider', displayName: 'Disconnected', publishTabLabel: 'Publish' },
          isBundlePublished: () => true,
          cleanupPublishedBundle: async () => {
            order.push('disconnected-remote');
            return { confirmed: true };
          },
        }),
      ],
      onProviderProgress: vi.fn(),
      deleteLocalBundle: () => { order.push('local'); },
    });
    expect(order).toEqual(['active-remote', 'disconnected-remote', 'local']);
  });
});
