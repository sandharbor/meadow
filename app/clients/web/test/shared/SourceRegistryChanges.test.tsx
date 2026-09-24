/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceRegistryChanges } from '../../src/areas/bundle/sourcing/components/SourceRegistryChanges.js';

const before = [
  { id: 'notes', name: 'notes', directory: '/library/notes' },
  { id: 'research', name: 'research', directory: '/library/research', aliases: ['papers'] },
  { id: 'reference', name: 'reference', directory: '/library/reference' },
];

describe('source settings summary', () => {
  it('shows only the removed source without repeating directories or unchanged sources', () => {
    render(<SourceRegistryChanges changes={{ before, after: before.slice(0, 2), stale: false, outputPathsChange: false }} />);
    const summary = screen.getByRole('region', { name: 'Source registry changes' });
    expect(summary).toHaveTextContent('Removed source reference');
    expect(summary).not.toHaveTextContent('notes');
    expect(summary).not.toHaveTextContent('research');
    expect(summary).not.toHaveTextContent('/library');
  });

  it('compares a changed name and location while omitting unchanged sources', () => {
    const after = before.map(source => source.id === 'research' ? { ...source, name: 'library', directory: '/library/research-relocated' } : source);
    render(<SourceRegistryChanges changes={{ before, after, stale: false, outputPathsChange: false }} />);
    const summary = screen.getByRole('region', { name: 'Source registry changes' });
    expect(within(summary).getByRole('group', { name: 'Renamed: research → library' })).toBeInTheDocument();
    expect(within(summary).getByRole('group', { name: 'Renamed: /library/research → /library/research-relocated' })).toBeInTheDocument();
    expect(summary.querySelector('del')).toBeInTheDocument();
    expect(summary.querySelector('ins')).toBeInTheDocument();
    expect(summary).not.toHaveTextContent('notes');
    expect(summary).not.toHaveTextContent('reference');
  });

  it('omits an unchanged registry and labels newly added sources', () => {
    const view = render(<SourceRegistryChanges changes={{ before, after: before, stale: false, outputPathsChange: false }} />);
    expect(screen.queryByRole('region', { name: 'Source registry changes' })).not.toBeInTheDocument();
    view.rerender(<SourceRegistryChanges changes={{ before: before.slice(0, 2), after: before, stale: false, outputPathsChange: false }} />);
    expect(screen.getByRole('region', { name: 'Source registry changes' })).toHaveTextContent('Added source reference');
  });
});
