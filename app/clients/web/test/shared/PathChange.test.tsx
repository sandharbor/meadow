/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PathChange, splitPathChange } from '../../src/shared/components/PathChange.js';
import { SourceNamesProvider, splitSourcePathLabel } from '../../src/shared/components/SourceNames.js';

describe('source path changes', () => {
  it('keeps the source delimiter attached when showing a file at the source root', () => {
    expect(splitSourcePathLabel('notes://Inside.md')).toEqual({ directory: 'notes://', filename: 'Inside.md', separator: '' });
    expect(splitSourcePathLabel('notes://Same/Inside.md')).toEqual({ directory: 'notes://Same', filename: 'Inside.md', separator: '/' });
    expect(splitSourcePathLabel('Inside.md')).toEqual({ directory: '', filename: 'Inside.md', separator: '' });
  });

  it('distinguishes a cross-source move from a folder move', () => {
    render(<SourceNamesProvider sources={[{ id: 'source000001', name: 'notes' }, { id: 'source000002', name: 'research' }]}>
      <PathChange before="_mw_sources/source000001/Same/Inside.md" after="_mw_sources/source000002/Moved/Inside.md" />
    </SourceNamesProvider>);
    expect(screen.getByRole('group', { name: 'Moved: notes://Same/Inside.md → research://Moved/Inside.md' })).toBeInTheDocument();
    expect(screen.getByTestId('source-path-before')).toHaveTextContent('notes://Same/Inside.md');
    expect(screen.getByTestId('source-path-after')).toHaveTextContent('research://Moved/Inside.md');
  });

  it.each([
    ['docs/Company overview.md', 'docs/Company background.md', 'Renamed', 'overview', 'background'],
    ['docs/archive/Page.md', 'docs/current/Page.md', 'Moved', 'archive', 'current'],
    ['docs/archive/Old.md', 'docs/current/New.md', 'Moved and renamed', 'Old', 'New'],
    ['Page.md', 'notes/Page.md', 'Moved', null, 'notes'],
    ['notes/Page.md', 'Page.md', 'Moved', 'notes', null],
    ['docs/研究 old.md', 'docs/研究 new.md', 'Renamed', 'old', 'new'],
  ])('shows %s → %s with readable changes', (before, after, kind, removed, added) => {
    const { container } = render(<PathChange before={before} after={after} />);
    expect(screen.getByRole('group', { name: `${kind}: ${before} → ${after}` })).toBeInTheDocument();
    if (removed) expect([...container.querySelectorAll('del')].some(element => element.textContent === removed)).toBe(true);
    else expect(container.querySelector('del')).toBeNull();
    if (added) expect([...container.querySelectorAll('ins')].some(element => element.textContent === added)).toBe(true);
    else expect(container.querySelector('ins')).toBeNull();
    expect(screen.getByTestId('source-path-before')).toHaveTextContent(before);
    expect(screen.getByTestId('source-path-after')).toHaveTextContent(after);
  });

  it('keeps changed words whole and does not duplicate overlapping prefix and suffix', () => {
    expect(splitPathChange('t003 ---- old section.md', 't003 ---- new section.md')).toEqual({ prefix: 't003 ---- ', before: 'old', after: 'new', suffix: ' section.md' });
    expect(splitPathChange('page.md', 'page.md')).toEqual({ prefix: 'page.md', before: '', after: '', suffix: '' });
    expect(splitPathChange('A', 'AA')).toEqual({ prefix: '', before: 'A', after: 'AA', suffix: '' });
  });

  it('retains full long paths for accessible comparison with each directory attached to its filename', () => {
    const directory = 'long-directory/'.repeat(20);
    render(<PathChange before={`${directory}old.md`} after={`${directory}new.md`} />);
    expect(screen.getByRole('group')).toHaveAttribute('title', `${directory}old.md → ${directory}new.md`);
    expect(screen.getByTestId('source-path-before')).toHaveTextContent(`${directory}old.md`);
    expect(screen.getByTestId('source-path-after')).toHaveTextContent(`${directory}new.md`);
  });
});
