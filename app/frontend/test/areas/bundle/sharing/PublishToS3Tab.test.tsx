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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublishToS3Tab } from '../../../../../publishing_providers/S3PublishingProvider/frontend/internal/PublishToS3Tab';

function jsonResponse(body: unknown) {
  return new globalThis.Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PublishToS3Tab', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not let a stale initial config response overwrite a saved slug', async () => {
    let resolveInitialConfig!: (response: ReturnType<typeof jsonResponse>) => void;
    const initialConfig = new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
      resolveInitialConfig = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/provider-config') && (init?.method ?? 'GET') === 'GET') {
        return initialConfig;
      }
      if (url.endsWith('/provider-config') && init?.method === 'PUT') {
        return jsonResponse({ publishSlug: 'meadow-test-bundle-big-s3' });
      }
      if (url.includes('/published-file-counts')) {
        return jsonResponse({ htmlCount: 0, otherCount: 0 });
      }
      if (url.includes('/publication-state')) {
        return jsonResponse({
          status: { kind: 'not-published' },
          events: [],
          remotelyPresentVersionIds: [],
        });
      }
      return jsonResponse({});
    });

    render(
      <PublishToS3Tab
        bundleSlug="meadow-test-bundle-big"
        selectedVersionId="vAb1234"
        changedFilesCount={0}
        onBusyChange={() => {}}
        onAuthError={() => {}}
        onViewChanges={() => {}}
      />,
    );

    const input = await screen.findByTestId('s3-publish-slug-input');
    fireEvent.change(input, { target: { value: 'meadow-test-bundle-big-s3' } });
    fireEvent.click(screen.getByTestId('s3-save-slug'));

    await waitFor(() => expect(input).toHaveValue('meadow-test-bundle-big-s3'));
    resolveInitialConfig(jsonResponse({ publishSlug: 'meadow-test-bundle-big' }));
    await initialConfig;
    await Promise.resolve();

    expect(input).toHaveValue('meadow-test-bundle-big-s3');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/provider-config'),
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
