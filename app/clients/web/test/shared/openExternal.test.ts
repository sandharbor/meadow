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
import { openExternal } from '../../src/shared/utils/openExternal';

const electronWindow = window as unknown as {
  electronAPI?: {
    openExternal: (url: string) => Promise<void>;
  };
};

afterEach(() => {
  delete electronWindow.electronAPI;
  vi.restoreAllMocks();
});

describe('openExternal', () => {
  it('uses the Desktop host to open an external URL when Electron is present', async () => {
    const desktopOpen = vi.fn(async () => undefined);
    const browserOpen = vi.spyOn(window, 'open').mockReturnValue(null);
    electronWindow.electronAPI = { openExternal: desktopOpen };

    await openExternal('https://example.test/published', 'test');

    expect(desktopOpen).toHaveBeenCalledWith('https://example.test/published');
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it('opens a new isolated tab when running as a browser client', async () => {
    const browserOpen = vi.spyOn(window, 'open').mockReturnValue(null);

    await openExternal('https://example.test/published', 'test');

    expect(browserOpen).toHaveBeenCalledWith(
      'https://example.test/published',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
