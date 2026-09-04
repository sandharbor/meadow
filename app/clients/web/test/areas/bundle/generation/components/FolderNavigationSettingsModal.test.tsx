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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FolderNavigationSettingsModal from '../../../../../src/areas/bundle/generation/components/FolderNavigationSettingsModal';

const request = vi.hoisted(() => vi.fn());
vi.mock('../../../../../src/shared/utils/apiClient', () => ({ apiRequest: request }));

describe('folder navigation settings', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation(async (url: string) => ({ ok: true, json: async () =>
      url === 'app-config' ? { generationFolderNavigationDefaultOpen: false } : { generationFolderNavigationDefaultOpen: true },
    }));
  });

  it('loads global and bundle defaults and saves inheritance without changing feature enablement', async () => {
    const onSaved = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(<FolderNavigationSettingsModal bundleSlug="example" onSaved={onSaved} onClose={onClose} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled());
    expect(screen.getByLabelText('Global folder navigation default')).toHaveValue('closed');
    expect(screen.getByLabelText('Bundle folder navigation default')).toHaveValue('open');
    fireEvent.change(screen.getByLabelText('Global folder navigation default'), { target: { value: 'open' } });
    fireEvent.change(screen.getByLabelText('Bundle folder navigation default'), { target: { value: 'inherit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('generation/options', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ generationFolderNavigationDefaultOpen: true }),
    }));
    expect(request).toHaveBeenCalledWith('bundles/example/generation/options', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ generationFolderNavigationDefaultOpen: null }),
    }));
  });

  it('keeps the dialog open and avoids regeneration when saving fails', async () => {
    const onSaved = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(<FolderNavigationSettingsModal bundleSlug="example" onSaved={onSaved} onClose={onClose} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled());
    request.mockResolvedValue({ ok: false });
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the global default.');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
