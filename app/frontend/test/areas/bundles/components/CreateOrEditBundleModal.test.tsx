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
import { afterEach, describe, expect, it, vi } from 'vitest';
import CreateOrEditBundleModal from '../../../../src/areas/bundles/components/CreateOrEditBundleModal';

const electronWindow = window as unknown as {
  electronAPI?: {
    showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete electronWindow.electronAPI;
});

describe('CreateOrEditBundleModal folder creation', () => {
  it('checks and creates a viable folder bundle with one submit', async () => {
    electronWindow.electronAPI = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['/vault/Alpha'],
      }),
    };
    const preflight = {
      fingerprint: 'fingerprint',
      plan: {
        sourceDirectory: '/vault',
        normalizedSelectedFolders: ['Alpha'],
        folderBundleNodeIds: ['aaaaaaaaaaaa'],
        entryBundleNodeId: 'aaaaaaaaaaaa',
        defaultOutlinksDepth: 1,
        defaultInlinksDepth: 0,
      },
      supportedSeedFileCount: 1,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => preflight })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, slug: 'alpha' }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();

    render(
      <CreateOrEditBundleModal
        isOpen
        onClose={vi.fn()}
        mode="create"
        onSuccess={onSuccess}
        directories={['/vault', '/other-notes']}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /One or more folders/ }));
    expect(screen.getByText('Notes Root *')).toBeInTheDocument();
    expect(screen.getByText(/not the folders that start the bundle/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add folders' }));
    await waitFor(() => expect(screen.getByTitle('/vault/Alpha')).toBeInTheDocument());

    const otherBundleDirectory = screen.getByRole('combobox', { name: 'Use a directory from another bundle' });
    fireEvent.change(otherBundleDirectory, { target: { value: '/other-notes' } });
    expect(screen.getByTitle('/vault/Alpha')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Use a directory from another bundle' }), { target: { value: '/vault' } });

    fireEvent.click(screen.getByRole('button', { name: /^Create Bundle$/ }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('alpha'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bundles/folders/preflight');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/bundles/folders');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).not.toHaveProperty('confirmHighImpact');
    expect(screen.queryByText('Creation prediction')).not.toBeInTheDocument();
  });

  it('keeps the creation form open when the selected folders have no supported files', async () => {
    electronWindow.electronAPI = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['/vault/Empty'],
      }),
    };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Selected folders do not contain any supported files' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();

    render(
      <CreateOrEditBundleModal
        isOpen
        onClose={vi.fn()}
        mode="create"
        onSuccess={onSuccess}
        directories={['/vault']}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /One or more folders/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add folders' }));
    await waitFor(() => expect(screen.getByTitle('/vault/Empty')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Create Bundle$/ }));

    expect(await screen.findByText('Selected folders do not contain any supported files')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
