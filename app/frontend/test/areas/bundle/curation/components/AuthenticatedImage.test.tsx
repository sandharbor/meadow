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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { apiRequest, requireApiSuccess } from '../../../../../src/shared/utils/apiClient';
import { AuthenticatedImage } from '../../../../../src/areas/bundle/curation/components/AuthenticatedImage';

vi.mock('../../../../../src/shared/utils/apiClient', () => ({
  apiRequest: vi.fn(),
  requireApiSuccess: vi.fn(),
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { warn: vi.fn() },
}));

const mockedApiRequest = vi.mocked(apiRequest);
const mockedRequireApiSuccess = vi.mocked(requireApiSuccess);

describe('AuthenticatedImage', () => {
  beforeEach(() => {
    mockedRequireApiSuccess.mockImplementation(async (response) => response);
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:authenticated-thumbnail'),
    });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis.URL, 'createObjectURL');
    Reflect.deleteProperty(globalThis.URL, 'revokeObjectURL');
    vi.restoreAllMocks();
  });

  it('loads protected media through apiRequest before assigning an image source', async () => {
    mockedApiRequest.mockResolvedValue(new globalThis.Response(
      new globalThis.Blob(['image bytes'], { type: 'image/png' }),
      { status: 200 },
    ));

    const { unmount } = render(
      <AuthenticatedImage
        sourcePath="bundles/example/generation/source-file/flower.png"
        alt="flower"
      />,
    );

    expect(screen.getByRole('status', { name: 'Loading flower' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'flower' })).toHaveAttribute(
      'src',
      'blob:authenticated-thumbnail',
    );
    expect(mockedApiRequest).toHaveBeenCalledWith(
      'bundles/example/generation/source-file/flower.png',
      expect.objectContaining({
        headers: { Accept: 'image/*' },
        signal: expect.any(globalThis.AbortSignal),
      }),
    );

    unmount();
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:authenticated-thumbnail');
  });

  it('shows a visible failure state instead of removing the thumbnail', async () => {
    mockedApiRequest.mockResolvedValue(new globalThis.Response('{}', { status: 401 }));
    mockedRequireApiSuccess.mockRejectedValue(new Error('Unauthorized'));

    render(
      <AuthenticatedImage
        sourcePath="bundles/example/generation/source-file/flower.gif"
        alt="flower animation"
      />,
    );

    expect(await screen.findByRole('img', { name: 'Failed to load flower animation' })).toHaveAttribute(
      'data-thumbnail-state',
      'error',
    );
  });
});
