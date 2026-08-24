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
import { render, waitFor } from '@testing-library/react';
import { apiRequest, requireApiSuccess } from '../../../../../src/shared/utils/apiClient';
import { ExcalidrawThumbnail } from '../../../../../src/areas/bundle/curation/components/ExcalidrawThumbnail';

vi.mock('../../../../../src/shared/utils/apiClient', () => ({
  apiRequest: vi.fn(),
  requireApiSuccess: vi.fn(),
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { warn: vi.fn() },
}));

const mockedApiRequest = vi.mocked(apiRequest);
const mockedRequireApiSuccess = vi.mocked(requireApiSuccess);

describe('ExcalidrawThumbnail', () => {
  beforeEach(() => {
    mockedRequireApiSuccess.mockImplementation(async (response) => response);
    mockedApiRequest.mockImplementation(async (input) => {
      if (input.toString().includes('excalidraw-vendor.js')) {
        return new globalThis.Response(
          new globalThis.Blob(['window.MeadowExcalidraw = {};'], { type: 'application/javascript' }),
          { status: 200 },
        );
      }
      return new globalThis.Response('```compressed-json\nencoded-scene\n```', { status: 200 });
    });
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:authenticated-vendor'),
    });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    delete (window as unknown as { MeadowExcalidraw?: unknown }).MeadowExcalidraw;
    Reflect.deleteProperty(globalThis.URL, 'createObjectURL');
    Reflect.deleteProperty(globalThis.URL, 'revokeObjectURL');
    vi.restoreAllMocks();
  });

  it('fetches the vendor bundle through the authenticated API transport', async () => {
    const { container } = render(
      <ExcalidrawThumbnail
        mdSourcePath="bundles/example/generation/source-file/drawing.excalidraw.md"
        vendorUrl="http://127.0.0.1:43123/api/generation/assets/excalidraw-vendor.js"
        alt="drawing"
      />,
    );

    await waitFor(() => {
      expect(document.head.querySelector('script[src="blob:authenticated-vendor"]')).not.toBeNull();
    });

    const exportedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    (window as unknown as { MeadowExcalidraw: unknown }).MeadowExcalidraw = {
      LZString: {
        decompressFromBase64: () => JSON.stringify({ elements: [], appState: {}, files: {} }),
      },
      exportToSvg: vi.fn(async () => exportedSvg),
    };
    document.head.querySelector('script[src="blob:authenticated-vendor"]')
      ?.dispatchEvent(new globalThis.Event('load'));

    await waitFor(() => {
      expect(container.querySelector('[aria-label="drawing"] svg')).not.toBeNull();
    });
    expect(mockedApiRequest).toHaveBeenCalledWith(
      'http://127.0.0.1:43123/api/generation/assets/excalidraw-vendor.js',
      { headers: { Accept: 'application/javascript' } },
    );
    expect(mockedApiRequest).toHaveBeenCalledWith(
      'bundles/example/generation/source-file/drawing.excalidraw.md',
    );
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:authenticated-vendor');
  });
});
