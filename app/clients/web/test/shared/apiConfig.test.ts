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
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('shared frontend API transport', () => {
  it('adds the launch capability only as a header on the exact backend API', async () => {
    const nativeFetch = vi.fn(async (
      _input: Parameters<typeof globalThis.fetch>[0],
      _init?: Parameters<typeof globalThis.fetch>[1],
    ) => (
      new globalThis.Response('{}', { status: 200 })
    ));
    vi.stubGlobal('fetch', nativeFetch);
    (window as unknown as { electronAPI: { getBackendConnection: () => Promise<unknown> } }).electronAPI = {
      getBackendConnection: async () => ({
        baseUrl: 'http://127.0.0.1:43123/api',
        capability: 'test-only-launch-capability',
      }),
    };

    const api = await import('../../src/shared/utils/apiConfig');
    await api.initializeApiConfig();
    await globalThis.fetch('http://127.0.0.1:43123/api/private', {
      headers: { 'Content-Type': 'application/json' },
    });

    const calls = nativeFetch.mock.calls as Array<Parameters<typeof globalThis.fetch>>;
    const [input, init] = calls[0];
    expect(input.toString()).not.toContain('test-only-launch-capability');
    expect(new globalThis.Headers(init?.headers).get('x-meadow-capability')).toBe('test-only-launch-capability');
    expect(new globalThis.Headers(init?.headers).get('content-type')).toBe('application/json');

    await globalThis.fetch('https://example.test/public');
    const [, externalInit] = calls[1];
    expect(new globalThis.Headers(externalInit?.headers).has('x-meadow-capability')).toBe(false);
  });
});
