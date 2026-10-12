/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPublishingProviderBackend } from '../../../../../src/areas/bundle/sharing/providers/IPublishingProviderBackend.js';

const registry = vi.hoisted(() => ({ providers: [] as IPublishingProviderBackend[] }));
vi.mock('../../../../../src/areas/bundle/sharing/providers/providerRegistry.js', () => ({
  getAllBackendProviders: () => registry.providers,
}));

import { cancelBundleRenamePublication, prepareBundleRenamePublication, undoBundleRenamePublication, deleteBundleAfterPublicationCleanup } from '../../../../../src/areas/bundle/sharing/providers/publicationOperations.js';
import type { GeneratedBundleVersionId } from '../../../../../../../contracts/types/shared/generated-bundle-versioning/generatedBundleVersioning.js';
import { getProviderMigrationScopes } from '../../../../../src/areas/bundle/sharing/providers/providerMigrationScopes.js';

describe('Sharing operations for outside callers', () => {
  beforeEach(() => { registry.providers = []; });

  it('rolls back a partially attempted preparation, but never cancels an unsupported operation', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('rollback failure'));
    const provider: IPublishingProviderBackend = {
      manifest: { id: 'provider', displayName: 'Destination', publishTabLabel: 'Publish' }, registerRoutes: vi.fn(),
      cancelPendingBundleRenamePublication: cancel,
    };
    registry.providers = [provider];
    const options = { bundleSlug: 'bundle', generatedVersionId: 'version' as GeneratedBundleVersionId, publishSlug: 'new-name', readerConnectionToPredecessor: 'connected' as const, predecessorCleanupPolicy: 'keep' as const };
    await expect(prepareBundleRenamePublication('provider', options, 'old-name')).rejects.toThrow('cannot prepare');
    expect(cancel).not.toHaveBeenCalled();
    registry.providers = [{ ...provider, prepareBundleRenamePublication: vi.fn().mockRejectedValue(new Error('preparation failure')) }];
    await expect(prepareBundleRenamePublication('provider', options, 'old-name')).rejects.toThrow('preparation failure');
    expect(cancel).toHaveBeenCalledWith('bundle', 'old-name');
  });

  it('refuses undo after a renamed publication is live, while rollback cancellation remains available', async () => {
    const cancel = vi.fn();
    registry.providers = [{
      manifest: { id: 'provider', displayName: 'Destination', publishTabLabel: 'Publish' }, registerRoutes: vi.fn(),
      getBundleRenamePublicationPlan: () => ({ providerId: 'provider', providerDisplayName: 'Destination', currentPublishSlug: 'new-name', currentPublicUrl: 'https://example.com/id-new-name-v1', predecessorCleanupRevisionCount: 0 }),
      cancelPendingBundleRenamePublication: cancel,
    }];
    await expect(undoBundleRenamePublication('provider', 'bundle', 'old-name')).rejects.toThrow('already been published');
    expect(cancel).not.toHaveBeenCalled();
    await cancelBundleRenamePublication('provider', 'bundle', 'old-name');
    expect(cancel).toHaveBeenCalledWith('bundle', 'old-name');
  });

  it('discovers every provider for deletion and preserves local files if one cannot confirm cleanup', async () => {
    const deleteLocalBundle = vi.fn();
    registry.providers = [{
      manifest: { id: 'disconnected', displayName: 'Old destination', publishTabLabel: 'Publish' }, registerRoutes: vi.fn(),
      isBundlePublished: () => true,
    }];
    await expect(deleteBundleAfterPublicationCleanup({ bundleSlug: 'bundle', operationId: 'operation', onProviderProgress: vi.fn(), deleteLocalBundle }))
      .rejects.toThrow('cannot confirm remote cleanup');
    expect(deleteLocalBundle).not.toHaveBeenCalled();
  });

  it('supplies owned migration locations at startup and retains retired migration scopes', () => {
    registry.providers = ['S3PublishingProvider', 'RetiredOnly', 'NoMigrations'].map(id => ({
      manifest: { id, displayName: id, publishTabLabel: 'Publish' }, registerRoutes: vi.fn(),
      retiredMigrationIds: id === 'RetiredOnly' ? ['retired-id'] : [],
    }));
    const scopes = getProviderMigrationScopes('/test/home');
    expect(scopes.map(scope => scope.name)).toEqual(['S3PublishingProvider', 'RetiredOnly']);
    expect(scopes[0].migrationsDir).toMatch(/S3PublishingProvider\/backend\/areas\/bundle\/sharing\/migrations$/);
    expect(scopes[0].ledgerPath).toBe('/test/home/app/publishing_providers/S3PublishingProvider/migrations.yaml');
    expect(scopes[1].retiredMigrationIds).toEqual(['retired-id']);
  });
});
