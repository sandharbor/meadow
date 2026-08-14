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

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import FilterPanel from '../../../../../src/areas/bundle/curation/components/FilterPanel';
import { IFilter } from '../../../../../src/areas/bundle/curation/types/filters';
import { Graph } from '../../../../../../shared_code/types/graph';
import type { IBundleNode } from '../../../../../../shared_code/types/IBundleNode';
import type { FileType } from '../../../../../../shared_code/types/FileType';
import type { BundleNodeKey } from '../../../../../../shared_code/types/bundleNodeConfig';

describe('FilterPanel', () => {
  const fileNode = (key: string, fileType: FileType): IBundleNode => ({
    bundleNodeKey: key as BundleNodeKey,
    bundleNodeName: key,
    bundleNodeKind: 'file',
    sourceGraphSubdirectory: '',
    fileType,
    label: key,
    depth: 0,
    remaining_depth: 0,
    getIdent: () => key,
  });

  const nodeTypesFilter = (enabled = false): IFilter => ({
    id: 'node-types-filter',
    name: 'Types',
    description: 'Filter nodes by the roles and file types present in this graph',
    bundleNodeSelectors: [],
    selectorApplicationCriteria: 'union',
    actions: [],
    enabled,
    isSolo: false,
    isHidden: false,
    isNodeTypeFilter: true,
    nodeTypeStates: {},
  });

  const gapFilterGroup: IFilter = {
    id: 'gap-filter',
    name: 'Gap',
    bundleNodeSelectors: [],
    selectorApplicationCriteria: 'union',
    actions: [],
    enabled: false,
    isSolo: false,
    isHidden: false,
    isGapFilter: true,
  };

  const gapFilter = (id: 'outlink-gap-filter' | 'inlink-gap-filter'): IFilter => ({
    id,
    name: id === 'outlink-gap-filter' ? 'Outlink Gap' : 'Inlink Gap',
    bundleNodeSelectors: [{
      id: `${id}-selector`,
      name: id,
      type: 'normal',
      select: () => new Set(),
    }],
    selectorApplicationCriteria: 'union',
    actions: [{ type: 'highlight', color: '#999999', isDashed: false }],
    enabled: false,
    isSolo: false,
    isHidden: false,
    showThresholdInput: true,
    thresholdValue: 5,
    hideFromFilterList: true,
  });

  const mockFilters: IFilter[] = [
    {
      id: 'test-filter-1',
      name: 'Test Filter 1',
      bundleNodeSelectors: [
        {
          id: 'test-selector-1',
          name: 'Test Selector 1',
          type: 'normal',
          select: () => new Set(['page1', 'page2'])
        }
      ],
      selectorApplicationCriteria: 'union',
      actions: [
        {
          type: 'highlight',
          color: '#ff0000',
          isDashed: false
        }
      ],
      enabled: false,
      isSolo: false,
      isHidden: false
    },
    {
      id: 'test-filter-2',
      name: 'Test Filter 2',
      bundleNodeSelectors: [
        {
          id: 'test-selector-2',
          name: 'Test Selector 2',
          type: 'normal',
          select: () => new Set(['page3', 'page4'])
        }
      ],
      selectorApplicationCriteria: 'union',
      actions: [
        {
          type: 'highlight',
          color: '#00ff00',
          isDashed: true
        }
      ],
      enabled: true,
      isSolo: false,
      isHidden: false
    },
    {
      id: 'search-by-title-filter',
      name: 'Search By Title',
      bundleNodeSelectors: [
        {
          id: 'search-by-title',
          name: 'Search By Title',
          type: 'normal',
          select: () => new Set(['page1', 'page2']),
          searchInput: ''
        }
      ],
      selectorApplicationCriteria: 'union',
      actions: [
        {
          type: 'highlight',
          color: '#009688',
          isDashed: false
        },
        {
          type: 'show_titles'
        }
      ],
      enabled: false,
      isSolo: false,
      isHidden: false,
      showSearchInput: true
    }
  ];

  const defaultPanelProps = {
    bundleSlug: 'test-bundle',
    onCustomFiltersChange: vi.fn(),
    graph: new Graph(),
  };

  it('renders all filters', () => {
    const mockOnFilterChange = vi.fn();
    render(<FilterPanel filters={mockFilters} onFilterChange={mockOnFilterChange} {...defaultPanelProps} />);

    // Search filter is rendered separately with just a search input, not as a named filter
    mockFilters.filter(f => f.id !== 'search-by-title-filter').forEach(filter => {
      expect(screen.getByText(filter.name)).toBeInTheDocument();
    });
    // Search filter is shown as a search input
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
  });

  it('shows correct initial checkbox states', () => {
    const mockOnFilterChange = vi.fn();
    render(<FilterPanel filters={mockFilters} onFilterChange={mockOnFilterChange} {...defaultPanelProps} />);

    const checkbox1 = screen.getByLabelText('Test Filter 1') as HTMLInputElement;
    const checkbox2 = screen.getByLabelText('Test Filter 2') as HTMLInputElement;

    expect(checkbox1.checked).toBe(false);
    expect(checkbox2.checked).toBe(true);
  });

  it('calls onFilterChange with correct parameters when toggling enabled state', () => {
    const mockOnFilterChange = vi.fn();
    render(<FilterPanel filters={mockFilters} onFilterChange={mockOnFilterChange} {...defaultPanelProps} />);

    const checkbox = screen.getByLabelText('Test Filter 1');
    fireEvent.click(checkbox);

    expect(mockOnFilterChange).toHaveBeenCalledWith('test-filter-1', { enabled: true });
  });

  it('shows solo button for each enabled non-search filter', () => {
    const mockOnFilterChange = vi.fn();
    const enabledFilters = mockFilters.map(f => ({ ...f, enabled: true }));
    render(<FilterPanel filters={enabledFilters} onFilterChange={mockOnFilterChange} {...defaultPanelProps} />);

    // Search filter's Solo/Hide buttons only show when search has text
    const soloButtons = screen.getAllByTitle('Solo');
    expect(soloButtons).toHaveLength(2); // Only non-search enabled filters
  });

  it('shows hide button for each enabled non-search filter', () => {
    const mockOnFilterChange = vi.fn();
    const enabledFilters = mockFilters.map(f => ({ ...f, enabled: true }));
    render(<FilterPanel filters={enabledFilters} onFilterChange={mockOnFilterChange} {...defaultPanelProps} />);

    // Search filter's Solo/Hide buttons only show when search has text
    const hideButtons = screen.getAllByTitle('Hide');
    expect(hideButtons).toHaveLength(2); // Only non-search enabled filters
  });

  it('calls onFilterChange with correct parameters when toggling solo state', () => {
    const mockOnFilterChange = vi.fn();
    const enabledFilters = mockFilters.map(f => ({ ...f, enabled: true }));
    render(<FilterPanel filters={enabledFilters} onFilterChange={mockOnFilterChange} {...defaultPanelProps} />);

    const soloButtons = screen.getAllByTitle('Solo');
    fireEvent.click(soloButtons[0]);

    expect(mockOnFilterChange).toHaveBeenCalledWith('test-filter-1', { isSolo: true });
  });

  it('calls onFilterChange with correct parameters when toggling hide state', () => {
    const mockOnFilterChange = vi.fn();
    const enabledFilters = mockFilters.map(f => ({ ...f, enabled: true }));
    render(<FilterPanel filters={enabledFilters} onFilterChange={mockOnFilterChange} {...defaultPanelProps} />);

    const hideButtons = screen.getAllByTitle('Hide');
    fireEvent.click(hideButtons[0]);

    expect(mockOnFilterChange).toHaveBeenCalledWith('test-filter-1', { isHidden: true });
  });

  it('renders search input always visible at top of panel', () => {
    const mockOnFilterChange = vi.fn();
    render(<FilterPanel filters={mockFilters} onFilterChange={mockOnFilterChange} {...defaultPanelProps} />);

    // Search input is always visible, regardless of filter enabled state
    const searchInput = screen.getByPlaceholderText('Search');
    expect(searchInput).toBeInTheDocument();
  });

  it('updates filter and enables Solo when search input changes from empty', async () => {
    const mockOnFilterChange = vi.fn();
    render(<FilterPanel filters={mockFilters} onFilterChange={mockOnFilterChange} {...defaultPanelProps} />);

    const searchInput = screen.getByPlaceholderText('Search');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(mockOnFilterChange).toHaveBeenCalledWith('search-by-title-filter', {
        bundleNodeSelectors: [
          {
            id: 'search-by-title',
            name: 'Search By Title',
            type: 'normal',
            searchInput: 'test',
            select: expect.any(Function)
          }
        ],
        isSolo: true
      });
    });
  });

  it('clears search and disables Solo and Hide when search input is cleared', async () => {
    const mockOnFilterChange = vi.fn();
    const filtersWithSearch = mockFilters.map(f =>
      f.id === 'search-by-title-filter'
        ? {
            ...f,
            enabled: true,
            isSolo: true,
            isHidden: true,
            bundleNodeSelectors: [{
              ...f.bundleNodeSelectors?.[0],
              searchInput: 'test'
            }]
          }
        : f
    );

    render(<FilterPanel filters={filtersWithSearch} onFilterChange={mockOnFilterChange} {...defaultPanelProps} />);
    const searchInput = screen.getByPlaceholderText('Search');

    // Clear the input
    fireEvent.change(searchInput, { target: { value: '' } });

    await waitFor(() => {
      expect(mockOnFilterChange).toHaveBeenCalledWith('search-by-title-filter', {
        bundleNodeSelectors: [
          {
            id: 'search-by-title',
            name: 'Search By Title',
            type: 'normal',
            searchInput: '',
            select: expect.any(Function)
          }
        ],
        isSolo: false,
        isHidden: false
      });
    });
  });

  it('hides Types when the graph only has one applicable type', () => {
    const graph = new Graph();
    graph.addNode(fileNode('note', 'md'));

    render(
      <FilterPanel
        filters={[nodeTypesFilter()]}
        onFilterChange={vi.fn()}
        {...defaultPanelProps}
        graph={graph}
        pages={graph.getAllNodes()}
      />
    );

    expect(screen.queryByText('Types')).not.toBeInTheDocument();
  });

  it('groups the graph types that are present and updates their individual state', () => {
    const graph = new Graph();
    graph.addNode(fileNode('note', 'md'));
    graph.addNode(fileNode('drawing', 'excalidraw'));
    const onFilterChange = vi.fn();

    render(
      <FilterPanel
        filters={[nodeTypesFilter(true)]}
        onFilterChange={onFilterChange}
        {...defaultPanelProps}
        graph={graph}
        pages={graph.getAllNodes()}
      />
    );

    expect(screen.getByText('Types')).toBeInTheDocument();
    expect(screen.queryByText('File Nodes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Types' }));
    expect(screen.getByText('File Nodes')).toBeInTheDocument();
    expect(screen.getByText('Image Nodes')).toBeInTheDocument();
    expect(screen.queryByText('Folder Nodes')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Solo Image Nodes'));
    expect(onFilterChange).toHaveBeenCalledWith('node-types-filter', {
      nodeTypeStates: {
        image: { showTitles: false, isSolo: true, isHidden: false },
      },
    });
  });

  it('keeps an active marker visible on an expandable group whether collapsed or expanded', () => {
    const graph = new Graph();
    graph.addNode(fileNode('note', 'md'));
    graph.addNode(fileNode('drawing', 'excalidraw'));
    const activeTypesFilter = {
      ...nodeTypesFilter(),
      nodeTypeStates: {
        image: { showTitles: false, isSolo: true, isHidden: false },
      },
    };

    render(
      <FilterPanel
        filters={[activeTypesFilter]}
        onFilterChange={vi.fn()}
        {...defaultPanelProps}
        graph={graph}
        pages={graph.getAllNodes()}
      />
    );

    const marker = screen.getByTitle('Types has active settings');
    expect(marker).toBeVisible();
    expect(screen.getByRole('button', { name: 'Expand Types' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Expand Types' }));
    expect(marker).toBeVisible();
    expect(screen.getByRole('button', { name: 'Collapse Types' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('marks Gap active when a nested gap filter is enabled', () => {
    render(
      <FilterPanel
        filters={[
          gapFilterGroup,
          { ...gapFilter('outlink-gap-filter'), enabled: true },
          gapFilter('inlink-gap-filter'),
        ]}
        onFilterChange={vi.fn()}
        {...defaultPanelProps}
      />
    );

    expect(screen.getByTitle('Gap has active settings')).toBeVisible();
  });

  it('groups Outlink and Inlink under a chevron-based Gap disclosure', () => {
    const onFilterChange = vi.fn();

    render(
      <FilterPanel
        filters={[gapFilterGroup, gapFilter('outlink-gap-filter'), gapFilter('inlink-gap-filter')]}
        onFilterChange={onFilterChange}
        {...defaultPanelProps}
      />
    );

    const gapDisclosure = screen.getByRole('button', { name: 'Expand Gap' });
    expect(gapDisclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Outlink Gap')).not.toBeInTheDocument();

    fireEvent.click(gapDisclosure);
    expect(screen.getByRole('button', { name: 'Collapse Gap' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Outlink Gap')).toBeInTheDocument();
    expect(screen.getByLabelText('Inlink Gap')).toBeInTheDocument();
    expect(screen.getByText('Outlink')).toBeInTheDocument();
    expect(screen.getByText('Inlink')).toBeInTheDocument();
    expect(screen.queryByText('Outlink Gap')).not.toBeInTheDocument();
    expect(screen.queryByText('Inlink Gap')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Outlink gap threshold')).toHaveValue(5);
    expect(screen.getByLabelText('Outlink gap threshold')).toHaveClass('w-12');

    fireEvent.click(screen.getByLabelText('Outlink Gap'));
    expect(onFilterChange).toHaveBeenCalledWith('outlink-gap-filter', { enabled: true });
  });

});
