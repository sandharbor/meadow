/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BundleNodeHoverCard from '../../../../../src/areas/bundle/shared-sourcing-curation/components/BundleNodeHoverCard.js';
import { SensitivityBadge } from '../../../../../src/areas/bundle/shared-sourcing-curation/components/SensitivityBadge.js';

describe('node sensitivity explanations', () => {
  it('shows colorless matches and sensitivity actions without inventing a color marker', () => {
    render(<BundleNodeHoverCard title="Notes" matchingFilters={[
      { filterId: 'plain', filterName: 'Title match', marksSensitive: false },
      { filterId: 'private', filterName: 'Private notes', marksSensitive: true },
      { filterId: 'colored', filterName: 'Colored notes', color: '#123456', isDashed: true, marksSensitive: true, detailInfo: 'outlinks depth: ~~4~~ 6' },
    ]} />);
    const rows = screen.getAllByTestId('node-hover-filter');
    expect(rows[0]).toHaveTextContent('Title match');
    expect(rows[0]).not.toHaveTextContent('+ sensitive');
    expect(rows[1]).toHaveTextContent('Private notes+ sensitive');
    expect(rows[2]).toHaveTextContent('Colored notes+ sensitive');
    expect(within(rows[2]).getByText('4')).toHaveClass('line-through');
    expect(within(rows[0]).queryByTestId('filter-highlight-color')).toBeNull();
    expect(within(rows[1]).queryByTestId('filter-highlight-color')).toBeNull();
    expect(within(rows[2]).getByTestId('filter-highlight-color')).toHaveStyle({ backgroundColor: '#123456' });
  });

  it('names every sensitivity filter in the question-mark explanation', () => {
    render(<SensitivityBadge sourceSensitive={false} filterNames={['Private notes', 'Internal plans']} />);
    const help = screen.getByRole('button', { name: 'Why this node is sensitive' });
    const tooltip = screen.getByRole('tooltip');
    expect(help).toHaveAttribute('aria-describedby', tooltip.id);
    expect(tooltip).toHaveTextContent('Marked sensitive by these enabled filters:');
    expect(tooltip).toHaveTextContent('Private notes');
    expect(tooltip).toHaveTextContent('Internal plans');
  });

  it('explains the source marking when source and filters both supply sensitivity', () => {
    render(<SensitivityBadge sourceSensitive filterNames={['Private notes']} />);
    expect(screen.getByRole('tooltip')).toHaveTextContent('meadow-sensitive is marked in the source.');
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('Private notes');
  });
});
