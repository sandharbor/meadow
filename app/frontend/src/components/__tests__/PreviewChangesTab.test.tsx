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

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PreviewChangesTab from '../PreviewChangesTab';

vi.mock('../../../../shared_components/ConfigFileExplorer', async () => {
  const ReactModule = await import('react');

  return {
    ConfigFileExplorer: ({ api, headerLeftContent }: { api: { fetchTree: (options?: { changedOnly?: boolean }) => Promise<unknown> }; headerLeftContent?: React.ReactNode }) => {
      ReactModule.useEffect(() => {
        void api.fetchTree({ changedOnly: true });
      }, [api]);

      return <div>{headerLeftContent}</div>;
    },
  };
});

describe('PreviewChangesTab', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows only HTML sections contributed by the visible change types', async () => {
    const modifiedPath = '/repo/preview/index.html';
    const deletedPath = '/repo/preview/about.html';
    const fetchTree = vi.fn().mockResolvedValue({
      root: '/repo/preview',
      tree: [
        { name: 'index.html', path: modifiedPath, type: 'file', gitStatus: 'modified' },
        { name: 'about.html', path: deletedPath, type: 'file', gitStatus: 'deleted' },
      ],
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        files: [
          { path: modifiedPath, sections: { head: false, header: false, main: false, footer: true } },
          { path: deletedPath, sections: { head: true, header: true, main: true, footer: true } },
        ],
      }),
    }));

    render(
      <PreviewChangesTab
        slug="test-site"
        isActive={true}
        isRegeneratingPreview={false}
        publishSuccess={true}
        baseApi={{
          fetchTree,
          fetchContent: vi.fn(),
          fetchOriginal: vi.fn(),
        }}
        refreshKey={0}
      />
    );

    await waitFor(() => {
      expect(fetchTree.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.click(screen.getByTitle('Filter changes'));

    await waitFor(() => {
      expect(screen.getByText('<head>')).toBeInTheDocument();
      expect(screen.getByText('<header>')).toBeInTheDocument();
      expect(screen.getByText('<main>')).toBeInTheDocument();
      expect(screen.getByText('<footer>')).toBeInTheDocument();
    });

    const deletedFilter = screen.getByText('Deleted').closest('label')?.querySelector('input');
    expect(deletedFilter).not.toBeNull();
    fireEvent.click(deletedFilter!);

    await waitFor(() => {
      expect(screen.queryByText('<head>')).not.toBeInTheDocument();
      expect(screen.queryByText('<header>')).not.toBeInTheDocument();
      expect(screen.queryByText('<main>')).not.toBeInTheDocument();
      expect(screen.getByText('<footer>')).toBeInTheDocument();
    });
  });
});
