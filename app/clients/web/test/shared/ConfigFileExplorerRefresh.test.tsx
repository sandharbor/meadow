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

import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfigFileExplorer, { type ConfigFileExplorerApi, type FileTreeResponse } from '../../shared_components/ConfigFileExplorer/ConfigFileExplorer';

describe('ConfigFileExplorer live content refresh', () => {
  beforeEach(() => { window.HTMLElement.prototype.scrollIntoView = vi.fn(); });
  afterEach(() => { Reflect.deleteProperty(window.HTMLElement.prototype, 'scrollIntoView'); });
  it('does not open a file from a late tree response after its view is discarded', async () => {
    let resolveTree!: (tree: FileTreeResponse) => void;
    const api: ConfigFileExplorerApi = {
      fetchTree: vi.fn(() => new Promise<FileTreeResponse>(resolve => { resolveTree = resolve; })),
      fetchContent: vi.fn(),
      fetchOriginal: vi.fn(),
    };
    const { unmount } = render(<ConfigFileExplorer api={api} autoSelectFirstChangedFile />);
    unmount();
    await act(async () => {
      resolveTree({ root: '/removed-version', tree: [{
        name: 'page.html', path: '/removed-version/page.html', type: 'file', gitStatus: 'new',
      }] });
    });
    expect(api.fetchContent).not.toHaveBeenCalled();
    expect(api.fetchOriginal).not.toHaveBeenCalled();
  });

  it('keeps the selected view visible while loading newly rendered content', async () => {
    const filePath = '/bundle/selected.txt';
    let contents = 'Before customization';
    let release: (() => void) | undefined;
    const fetchContent = vi.fn(async () => {
      if (release !== undefined) await new Promise<void>(resolve => { release = resolve; });
      return { content: contents, path: filePath, fileType: 'text' as const };
    });
    const api: ConfigFileExplorerApi = {
      fetchTree: vi.fn(async () => ({ root: '/bundle', tree: [{ name: 'selected.txt', path: filePath, type: 'file' as const }] })),
      fetchContent,
      fetchOriginal: vi.fn(async () => ({ content: null, path: filePath, isNew: true })),
    };
    const props = { api, readOnly: true, initialSelectedFile: filePath };
    const { rerender } = render(<ConfigFileExplorer {...props} contentRefreshKey={0} />);
    await waitFor(() => expect(screen.getByText('Before customization')).toBeInTheDocument());
    const initialCalls = fetchContent.mock.calls.length;
    contents = 'After customization';
    release = () => undefined;
    rerender(<ConfigFileExplorer {...props} contentRefreshKey={1} />);
    await waitFor(() => expect(fetchContent.mock.calls.length).toBe(initialCalls + 1));
    expect(screen.getByText('Before customization')).toBeInTheDocument();
    await act(async () => { release?.(); });
    await waitFor(() => expect(screen.getByText('After customization')).toBeInTheDocument());
    expect(screen.getAllByText('selected.txt').length).toBeGreaterThan(0);
  });
});
