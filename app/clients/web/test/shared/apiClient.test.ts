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

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('frontend API client', () => {
  it('resolves API-relative paths and applies safe default headers', async () => {
    const nativeFetch = vi.fn(async (
      _input: Parameters<typeof globalThis.fetch>[0],
      _init?: Parameters<typeof globalThis.fetch>[1],
    ) => new globalThis.Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', nativeFetch);
    const { apiRequest } = await import('../../src/shared/utils/apiClient');

    await apiRequest('bundles/detailed');

    const [input, init] = nativeFetch.mock.calls[0];
    expect(input).toBe('/api/bundles/detailed');
    expect(new globalThis.Headers(init?.headers).get('accept')).toBe('application/json');
  });

  it('serializes JSON requests without callers managing content headers', async () => {
    const nativeFetch = vi.fn(async (
      _input: Parameters<typeof globalThis.fetch>[0],
      _init?: Parameters<typeof globalThis.fetch>[1],
    ) => new globalThis.Response(null, { status: 204 }));
    vi.stubGlobal('fetch', nativeFetch);
    const { apiRequest } = await import('../../src/shared/utils/apiClient');

    await apiRequest('bundles', { method: 'POST', json: { name: 'example' } });

    const [, init] = nativeFetch.mock.calls[0];
    expect(new globalThis.Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(init?.body).toBe('{"name":"example"}');
  });

  it('routes non-API requests through the raw resource path unchanged', async () => {
    const nativeFetch = vi.fn(async (
      _input: Parameters<typeof globalThis.fetch>[0],
      _init?: Parameters<typeof globalThis.fetch>[1],
    ) => new globalThis.Response('asset', { status: 200 }));
    vi.stubGlobal('fetch', nativeFetch);
    const { resourceRequest } = await import('../../src/shared/utils/apiClient');

    await resourceRequest('https://static.example.test/file.json?signature=secret');

    const [input, init] = nativeFetch.mock.calls[0];
    expect(input).toBe('https://static.example.test/file.json?signature=secret');
    expect(init).toEqual({});
  });

  it('keeps API and resource requests on their explicit paths', async () => {
    const nativeFetch = vi.fn(async (
      _input: Parameters<typeof globalThis.fetch>[0],
      _init?: Parameters<typeof globalThis.fetch>[1],
    ) => new globalThis.Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', nativeFetch);
    const { apiRequest, resourceRequest } = await import('../../src/shared/utils/apiClient');

    expect(() => apiRequest('https://static.example.test/file.json')).toThrow('resourceRequest');
    expect(() => resourceRequest('/api/bundles')).toThrow('apiRequest');
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it('uses the configured authenticated transport in Electron', async () => {
    const nativeFetch = vi.fn(async (
      _input: Parameters<typeof globalThis.fetch>[0],
      _init?: Parameters<typeof globalThis.fetch>[1],
    ) => new globalThis.Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', nativeFetch);
    (window as unknown as { electronAPI: { getBackendConnection: () => Promise<unknown> } }).electronAPI = {
      getBackendConnection: async () => ({
        baseUrl: 'http://127.0.0.1:43123/api',
        capability: 'test-only-launch-capability',
      }),
    };
    const api = await import('../../src/shared/utils/apiClient');
    const config = await import('../../src/shared/utils/apiConfig');
    await config.initializeApiConfig();

    await api.apiRequest('private');

    const [input, init] = nativeFetch.mock.calls[0];
    expect(input).toBe('http://127.0.0.1:43123/api/private');
    expect(new globalThis.Headers(init?.headers).get('x-meadow-capability')).toBe('test-only-launch-capability');
  });

  it('normalizes failed JSON responses without logging query values', async () => {
    const nativeFetch = vi.fn(async (
      _input: Parameters<typeof globalThis.fetch>[0],
      _init?: Parameters<typeof globalThis.fetch>[1],
    ) => new globalThis.Response(
      JSON.stringify({ error: 'Bundle was not found' }),
      { status: 404, statusText: 'Not Found', headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', nativeFetch);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { apiJson } = await import('../../src/shared/utils/apiClient');

    const promise = apiJson(`bundles/example?token=secret-value`, { method: 'DELETE' });

    await expect(promise).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Bundle was not found',
      status: 404,
      method: 'DELETE',
      path: '/api/bundles/example',
    });
    expect(debug).toHaveBeenCalledWith(expect.not.stringContaining('secret-value'));
  });
});
