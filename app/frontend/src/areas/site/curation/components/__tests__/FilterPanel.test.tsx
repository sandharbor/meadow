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
import FilterPanel from '../FilterPanel';
import { IFilter } from '../../types/filters';

describe('FilterPanel', () => {
  const mockFilters: IFilter[] = [
    {
      id: 'test-filter-1',
      name: 'Test Filter 1',
      pageSelectors: [
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
      pageSelectors: [
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
      pageSelectors: [
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
    siteSlug: 'test-site',
    onCustomFiltersChange: vi.fn(),
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
        pageSelectors: [
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
            pageSelectors: [{
              ...f.pageSelectors?.[0],
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
        pageSelectors: [
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

}); 