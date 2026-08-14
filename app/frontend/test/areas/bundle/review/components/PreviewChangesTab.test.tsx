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
import PreviewChangesTab, {
  shouldAutoExpandPreviewFolder,
  shouldShowHtmlForSectionFilters,
} from '../../../../../src/areas/bundle/review/components/PreviewChangesTab';

vi.mock('../../../../../../shared_components/ConfigFileExplorer/index', async () => {
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

  it('keeps generated assets, generated pages, and the search index collapsed during automatic expansion', () => {
    expect(shouldAutoExpandPreviewFolder({
      name: '_mw_assets',
      path: '/repo/preview/_mw_assets',
      type: 'directory',
    })).toBe(false);
    expect(shouldAutoExpandPreviewFolder({
      name: '_mw_gen',
      path: '/repo/preview/_mw_gen',
      type: 'directory',
    })).toBe(false);
    expect(shouldAutoExpandPreviewFolder({
      name: 'index',
      path: '/repo/preview/_mw_assets/cust/search/index',
      type: 'directory',
    })).toBe(false);
    expect(shouldAutoExpandPreviewFolder({
      name: 'search',
      path: '/repo/preview/_mw_assets/cust/search',
      type: 'directory',
    })).toBe(true);
    expect(shouldAutoExpandPreviewFolder({
      name: 'pages',
      path: '/repo/preview/pages',
      type: 'directory',
    })).toBe(true);
  });

  it('routes unclassified HTML changes through the Other filter', () => {
    expect(shouldShowHtmlForSectionFilters(
      { head: false, aside: false, header: false, main: false, footer: false, other: true },
      { head: true, aside: true, header: true, main: true, footer: true, other: true },
    )).toBe(true);

    expect(shouldShowHtmlForSectionFilters(
      { head: false, aside: false, header: false, main: false, footer: false, other: true },
      { head: true, aside: true, header: true, main: true, footer: true, other: false },
    )).toBe(false);

    expect(shouldShowHtmlForSectionFilters(
      { head: false, aside: false, header: true, main: false, footer: false, other: false },
      { head: true, aside: true, header: false, main: true, footer: true, other: true },
    )).toBe(false);

    expect(shouldShowHtmlForSectionFilters(
      { head: false, aside: false, header: true, main: false, footer: false, other: true },
      { head: true, aside: true, header: false, main: true, footer: true, other: true },
    )).toBe(true);
  });

  it('shows unclassified HTML changes as Other in the filter dropdown', async () => {
    const modifiedPath = '/repo/preview/index.html';
    const fetchTree = vi.fn().mockResolvedValue({
      root: '/repo/preview',
      tree: [
        { name: 'index.html', path: modifiedPath, type: 'file', gitStatus: 'modified' },
      ],
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        files: [
          {
            path: modifiedPath,
            sections: { head: false, aside: false, header: false, main: false, footer: false, other: true },
          },
        ],
      }),
    }));

    render(
      <PreviewChangesTab
        slug="test-bundle"
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

    const otherFilter = await screen.findByText('Other');
    expect(otherFilter.closest('label')?.querySelector('span.tabular-nums')).toHaveTextContent('1');
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
          { path: modifiedPath, sections: { head: false, aside: false, header: false, main: false, footer: true, other: false } },
          { path: deletedPath, sections: { head: true, aside: true, header: true, main: true, footer: true, other: true } },
        ],
      }),
    }));

    render(
      <PreviewChangesTab
        slug="test-bundle"
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
      expect(screen.getByText('<aside>')).toBeInTheDocument();
      expect(screen.getByText('<header>')).toBeInTheDocument();
      expect(screen.getByText('<main>')).toBeInTheDocument();
      expect(screen.getByText('<footer>')).toBeInTheDocument();
    });

    const deletedFilter = screen.getByText('Deleted').closest('label')?.querySelector('input');
    expect(deletedFilter).not.toBeNull();
    fireEvent.click(deletedFilter!);

    await waitFor(() => {
      expect(screen.queryByText('<head>')).not.toBeInTheDocument();
      expect(screen.queryByText('<aside>')).not.toBeInTheDocument();
      expect(screen.queryByText('<header>')).not.toBeInTheDocument();
      expect(screen.queryByText('<main>')).not.toBeInTheDocument();
      expect(screen.getByText('<footer>')).toBeInTheDocument();
    });
  });
});
