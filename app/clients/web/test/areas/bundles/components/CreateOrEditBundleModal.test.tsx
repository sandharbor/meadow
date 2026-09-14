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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('CreateOrEditBundleModal directory choices', () => {
  it('captures choices on opening and keeps a newly browsed directory through parent updates', async () => {
    electronWindow.electronAPI = { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/notes/films'] }) };
    const props = { onClose: vi.fn(), mode: 'create' as const, onSuccess: vi.fn() };
    const { rerender } = render(<CreateOrEditBundleModal {...props} isOpen={false} directories={[]} />);
    rerender(<CreateOrEditBundleModal {...props} isOpen directories={['/notes']} />);
    expect(screen.queryByRole('combobox', { name: 'Use a directory from another bundle' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Choose a different folder'));
    fireEvent.click(screen.getByTitle('Browse for folder'));
    await waitFor(() => expect(screen.getByPlaceholderText('Enter a custom directory path')).toHaveValue('/notes/films'));
    expect(screen.queryByRole('combobox', { name: 'Use a directory from another bundle' })).not.toBeInTheDocument();

    rerender(<CreateOrEditBundleModal {...props} isOpen directories={['/notes', '/notes/films']} existingSlugs={['new-bundle']} />);
    expect(screen.getByPlaceholderText('Enter a custom directory path')).toHaveValue('/notes/films');
    expect(screen.queryByRole('combobox', { name: 'Use a directory from another bundle' })).not.toBeInTheDocument();

    rerender(<CreateOrEditBundleModal {...props} isOpen={false} directories={['/notes', '/notes/films']} />);
    rerender(<CreateOrEditBundleModal {...props} isOpen directories={['/notes', '/notes/films']} />);
    expect(screen.getByRole('combobox', { name: 'Use a directory from another bundle' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '/notes/films' })).toBeInTheDocument();
    expect(screen.getByTitle('/notes')).toBeInTheDocument();
  });

  it('keeps pre-existing alternatives available when typing a new directory', () => {
    const props = { onClose: vi.fn(), mode: 'create' as const, onSuccess: vi.fn() };
    const { rerender } = render(<CreateOrEditBundleModal {...props} isOpen directories={['/notes', '/work', '/notes']} />);
    fireEvent.click(screen.getByTitle('Choose a different folder'));
    fireEvent.change(screen.getByPlaceholderText('Enter a custom directory path'), { target: { value: '/new/directory' } });
    rerender(<CreateOrEditBundleModal {...props} isOpen directories={['/new/directory']} />);

    expect(screen.getByPlaceholderText('Enter a custom directory path')).toHaveValue('/new/directory');
    expect(screen.getByRole('option', { name: '/notes' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '/work' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '/new/directory' })).not.toBeInTheDocument();
  });
});

describe('CreateOrEditBundleModal pending submission', () => {
  it('stays busy after choosing a page and sends only one creation request despite repeat submissions', async () => {
    let finishCreation!: (response: globalThis.Response) => void;
    const pendingCreation = new Promise<globalThis.Response>(resolve => { finishCreation = resolve; });
    const fetchMock = vi.fn((_url: string, options?: globalThis.RequestInit) => {
      if (options?.method === 'POST') return pendingCreation;
      return Promise.resolve(new globalThis.Response(JSON.stringify({
        count: 1,
        pages: [{ title: 'Company Brain', directory: '', file_type: 'md', fullPath: 'Company Brain.md', modifiedTimeMs: 0 }],
      })));
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<CreateOrEditBundleModal isOpen onClose={onClose} mode="create" onSuccess={onSuccess} directories={['/vault']} />);

    const search = screen.getByPlaceholderText('Type to search…');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Company Brain' } });
    fireEvent.click(await screen.findByRole('button', { name: /Company.*Brain/ }));

    const createButton = screen.getByRole('button', { name: 'Create Bundle' });
    const form = createButton.closest('form')!;
    act(() => {
      fireEvent.click(createButton);
      fireEvent.submit(form);
    });

    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(createButton).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(createButton);
    fireEvent.submit(form);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      finishCreation(new globalThis.Response(JSON.stringify({ slug: 'company-brain' })));
      await pendingCreation;
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledExactlyOnceWith('company-brain'));
  });

  it('allows retrying when creation fails', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockResolvedValueOnce(new globalThis.Response(JSON.stringify({ slug: 'company-brain' })));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('alert', vi.fn());
    const onSuccess = vi.fn();
    render(<CreateOrEditBundleModal
      isOpen onClose={vi.fn()} mode="create" onSuccess={onSuccess} directories={['/vault']}
      findInBundlesOptions={{ vaultPath: '/vault', folderPath: '', pageName: 'Company Brain' }}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Create Bundle' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Bundle' })).toBeEnabled());
    expect(onSuccess).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('Failed to create bundle');
    fireEvent.click(screen.getByRole('button', { name: 'Create Bundle' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledExactlyOnceWith('company-brain'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('CreateOrEditBundleModal folder creation', () => {
  function stubFolderValidation(otherFetch = vi.fn()) {
    vi.stubGlobal('fetch', (url: string, options?: globalThis.RequestInit) => url.endsWith('/folders/validate-selection')
      ? Promise.resolve(new globalThis.Response(JSON.stringify({ selectionError: null, folderErrors: [] })))
      : otherFetch(url, options));
  }

  beforeEach(() => stubFolderValidation());

  const outsideMessage = 'This folder is outside the Notes Root. Choose the root itself or one of its subfolders.';
  const validSelection = () => new globalThis.Response(JSON.stringify({ selectionError: null, folderErrors: [] }));
  const invalidSelection = (folder: string) => new globalThis.Response(JSON.stringify({
    selectionError: null, folderErrors: [{ folder, message: outsideMessage }],
  }));

  it('shows outside folders before submission and clears the error when the Notes Root is corrected', async () => {
    let finishValidation!: (response: globalThis.Response) => void;
    const pending = new Promise<globalThis.Response>(resolve => { finishValidation = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(pending).mockImplementation(() => Promise.resolve(validSelection()));
    vi.stubGlobal('fetch', fetchMock);
    electronWindow.electronAPI = { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/vault-other/Alpha'] }) };
    render(<CreateOrEditBundleModal isOpen onClose={vi.fn()} mode="create" onSuccess={vi.fn()} directories={['/vault', '/vault-other']} />);
    fireEvent.click(screen.getByRole('radio', { name: /One or more folders/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add folders' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const button = screen.getByRole('button', { name: 'Create Bundle' });
    expect(button).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Checking folders…');

    await act(async () => { finishValidation(invalidSelection('/vault-other/Alpha')); });
    expect(screen.getByRole('alert')).toHaveTextContent(outsideMessage);
    expect(button).toBeDisabled();
    expect(button.parentElement).toHaveTextContent('Fix the highlighted folders or change the Notes Root before creating the bundle.');
    fireEvent.submit(button.closest('form')!);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole('combobox', { name: 'Use a directory from another bundle' }), { target: { value: '/vault-other' } });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ sourceDirectory: '/vault-other', selectedFolders: ['/vault-other/Alpha'] });
  });

  it('rechecks remaining folders after an invalid folder is removed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(invalidSelection('/elsewhere/Beta'))
      .mockImplementation(() => Promise.resolve(validSelection()));
    vi.stubGlobal('fetch', fetchMock);
    electronWindow.electronAPI = { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/vault/Alpha', '/elsewhere/Beta'] }) };
    render(<CreateOrEditBundleModal isOpen onClose={vi.fn()} mode="create" onSuccess={vi.fn()} directories={['/vault']} />);
    fireEvent.click(screen.getByRole('radio', { name: /One or more folders/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add folders' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(outsideMessage);
    expect(screen.getByRole('button', { name: 'Create Bundle' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove /elsewhere/Beta' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Bundle' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not enable creation when an old successful validation arrives after the root changes', async () => {
    let finishOld!: (response: globalThis.Response) => void;
    let finishCurrent!: (response: globalThis.Response) => void;
    const oldRequest = new Promise<globalThis.Response>(resolve => { finishOld = resolve; });
    const currentRequest = new Promise<globalThis.Response>(resolve => { finishCurrent = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(oldRequest).mockReturnValueOnce(currentRequest);
    vi.stubGlobal('fetch', fetchMock);
    electronWindow.electronAPI = { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/vault/Alpha'] }) };
    render(<CreateOrEditBundleModal isOpen onClose={vi.fn()} mode="create" onSuccess={vi.fn()} directories={['/vault', '/other']} />);
    fireEvent.click(screen.getByRole('radio', { name: /One or more folders/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add folders' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('combobox', { name: 'Use a directory from another bundle' }), { target: { value: '/other' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => { finishOld(validSelection()); });
    expect(screen.getByRole('button', { name: 'Create Bundle' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Checking folders…');
    await act(async () => { finishCurrent(invalidSelection('/vault/Alpha')); });
    expect(screen.getByRole('alert')).toHaveTextContent(outsideMessage);
    expect(screen.getByRole('button', { name: 'Create Bundle' })).toBeDisabled();
  });

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
    stubFolderValidation(fetchMock);
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
    expect(screen.getByText(/Include this root folder itself or folders nested inside it/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add folders' }));
    await waitFor(() => expect(screen.getByTitle('/vault/Alpha')).toBeInTheDocument());
    expect(screen.getByText('alpha', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Home Page Title/ })).not.toBeInTheDocument();

    const otherBundleDirectory = screen.getByRole('combobox', { name: 'Use a directory from another bundle' });
    fireEvent.change(otherBundleDirectory, { target: { value: '/other-notes' } });
    expect(screen.getByTitle('/vault/Alpha')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Use a directory from another bundle' }), { target: { value: '/vault' } });

    await waitFor(() => expect(screen.getByRole('button', { name: /^Create Bundle$/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /^Create Bundle$/ }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('alpha'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bundles/folders/preflight');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/bundles/folders');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({ slug: 'alpha', selectedFolders: ['/vault/Alpha'] });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).not.toHaveProperty('confirmHighImpact');
    expect(screen.queryByText('Creation prediction')).not.toBeInTheDocument();
  });

  it('suggests names from the selected folders and preserves custom names and home titles', async () => {
    electronWindow.electronAPI = {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/vault/Alpha', '/vault/Beta'] }),
    };
    render(
      <CreateOrEditBundleModal isOpen onClose={vi.fn()} mode="create" onSuccess={vi.fn()} directories={['/vault']} existingSlugs={['alpha']} />
    );
    fireEvent.click(screen.getByRole('radio', { name: /One or more folders/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add folders' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Home Page Title/ })).toHaveValue('Alpha'));
    expect(screen.getByText('alpha-1', { exact: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move /vault/Beta earlier' }));
    expect(screen.getByRole('textbox', { name: /Home Page Title/ })).toHaveValue('Beta');
    expect(screen.getByText('beta', { exact: true })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: /Home Page Title/ }), { target: { value: 'Research Notes' } });
    expect(screen.getByText('research-notes', { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit bundle name' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Bundle Name/ }), { target: { value: 'my-research' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move /vault/Alpha earlier' }));
    expect(screen.getByRole('textbox', { name: /Home Page Title/ })).toHaveValue('Research Notes');
    expect(screen.getByRole('textbox', { name: /Bundle Name/ })).toHaveValue('my-research');

    fireEvent.click(screen.getByRole('button', { name: 'Remove /vault/Alpha' }));
    expect(screen.queryByRole('textbox', { name: /Home Page Title/ })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Bundle Name/ })).toHaveValue('my-research');
  });

  it('replaces a removed folder suggestion when another folder is chosen', async () => {
    electronWindow.electronAPI = {
      showOpenDialog: vi.fn()
        .mockResolvedValueOnce({ canceled: false, filePaths: ['/vault/Alpha'] })
        .mockResolvedValueOnce({ canceled: false, filePaths: ['/vault/Beta'] }),
    };
    render(
      <CreateOrEditBundleModal isOpen onClose={vi.fn()} mode="create" onSuccess={vi.fn()} directories={['/vault']} />
    );
    fireEvent.click(screen.getByRole('radio', { name: /One or more folders/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add folders' }));
    await waitFor(() => expect(screen.getByText('alpha', { exact: true })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Remove /vault/Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add folders' }));
    await waitFor(() => expect(screen.getByText('beta', { exact: true })).toBeInTheDocument());
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
    stubFolderValidation(fetchMock);
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
    await waitFor(() => expect(screen.getByRole('button', { name: /^Create Bundle$/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /^Create Bundle$/ }));

    expect(await screen.findByText('Selected folders do not contain any supported files')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
