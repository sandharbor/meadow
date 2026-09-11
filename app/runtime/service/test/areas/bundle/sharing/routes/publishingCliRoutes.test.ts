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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import router from '../../../../../src/areas/bundle/sharing/routes/publishingCliRoutes.js';
import {
  type IPublishingProviderBackend,
  PublishingProviderOperationError,
} from '../../../../../src/shared/publishing-provider-host/IPublishingProviderBackend.js';
import { getActiveBackendProviders, getAllBackendProviders } from '../../../../../src/shared/publishing-provider-host/providerRegistry.js';

vi.mock('../../../../../src/shared/publishing-provider-host/providerRegistry.js', () => ({
  getActiveBackendProviders: vi.fn(),
  getAllBackendProviders: vi.fn(),
}));

const publication = {
  providerInstanceId: 'destination',
  versionId: 'v123456',
  savedGenerationId: 'saved-generation',
  url: 'https://example.com/entry.html',
  changed: true,
  identityCreated: true,
  remainingAllowance: { kind: 'free-bundles', remaining: 2 },
};

function provider(id: string): IPublishingProviderBackend {
  return {
    manifest: { id, displayName: id, publishTabLabel: id },
    registerRoutes: vi.fn(),
    publishGeneratedBundle: vi.fn().mockResolvedValue(publication),
  };
}

function publish(body: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return request(app).post('/api/bundles/example/sharing/publish').send(body);
}

describe('CLI publication provider selection', () => {
  beforeEach(() => {
    vi.mocked(getActiveBackendProviders).mockReturnValue([]);
    vi.mocked(getAllBackendProviders).mockReturnValue([]);
  });

  it('preserves provider-owned identity and allowance facts for the default provider', async () => {
    const selected = provider('default');
    vi.mocked(getActiveBackendProviders).mockReturnValue([selected]);
    const response = await publish({ versionId: publication.versionId }).expect(200);
    expect(response.body).toMatchObject({
      operation: 'bundle.publish',
      provider: { id: 'default', instanceId: publication.providerInstanceId },
      identityCreated: true,
      remainingAllowance: publication.remainingAllowance,
    });
  });

  it('selects an installed provider explicitly regardless of active providers', async () => {
    const selected = provider('selected');
    const first = provider('first');
    const second = provider('second');
    vi.mocked(getAllBackendProviders).mockReturnValue([first, selected, second]);
    vi.mocked(getActiveBackendProviders).mockReturnValue([first, second]);
    const response = await publish({ versionId: publication.versionId, providerId: 'selected' }).expect(200);
    expect(selected.publishGeneratedBundle).toHaveBeenCalledExactlyOnceWith({
      bundleSlug: 'example', versionId: publication.versionId, operationId: expect.any(String),
    });
    expect(first.publishGeneratedBundle).not.toHaveBeenCalled();
    expect(second.publishGeneratedBundle).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      schemaVersion: 1,
      operation: 'bundle.publish',
      provider: { id: 'selected', instanceId: publication.providerInstanceId },
      identityCreated: true,
      remainingAllowance: publication.remainingAllowance,
      savedGenerationId: publication.savedGenerationId,
      url: publication.url,
      mutationBehavior: expect.any(Object),
    });
  });

  it('does not fall back to an active provider when an explicit ID is unknown', async () => {
    const active = provider('active');
    vi.mocked(getActiveBackendProviders).mockReturnValue([active]);
    vi.mocked(getAllBackendProviders).mockReturnValue([active]);
    const response = await publish({ versionId: publication.versionId, providerId: 'missing' }).expect(404);
    expect(response.body.code).toBe('PUBLISHING_PROVIDER_NOT_FOUND');
    expect(active.publishGeneratedBundle).not.toHaveBeenCalled();
  });

  it.each([null, '', '   ', 42, {}])('rejects invalid explicit provider ID %j', async providerId => {
    const response = await publish({ versionId: publication.versionId, providerId }).expect(400);
    expect(response.body.code).toBe('INVALID_PUBLISH_REQUEST');
  });

  it('still requires a single active provider when no explicit ID is given', async () => {
    const none = await publish({ versionId: publication.versionId }).expect(409);
    expect(none.body.code).toBe('NO_ACTIVE_PUBLISHING_PROVIDER');
    vi.mocked(getActiveBackendProviders).mockReturnValue([provider('first'), provider('second')]);
    const multiple = await publish({ versionId: publication.versionId }).expect(409);
    expect(multiple.body.code).toBe('MULTIPLE_ACTIVE_PUBLISHING_PROVIDERS');
  });

  it('preserves structured provider errors for explicit publication', async () => {
    const selected = provider('selected');
    vi.mocked(selected.publishGeneratedBundle!).mockRejectedValue(new PublishingProviderOperationError({
      statusCode: 409, code: 'GENERATION_NOT_SAVED', message: 'Save the selected generated version before publishing',
    }));
    vi.mocked(getAllBackendProviders).mockReturnValue([selected]);
    const response = await publish({ versionId: publication.versionId, providerId: 'selected' }).expect(409);
    expect(response.body).toMatchObject({
      schemaVersion: 1, operation: 'bundle.publish', success: false, code: 'GENERATION_NOT_SAVED',
    });
  });
});
