/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PathChange, splitPathChange } from '../../src/shared/components/PathChange.js';

describe('source path changes', () => {
  it.each([
    ['docs/Company overview.md', 'docs/Company background.md', 'Renamed', 'overview', 'background'],
    ['docs/archive/Page.md', 'docs/current/Page.md', 'Moved', 'archive', 'current'],
    ['docs/archive/Old.md', 'docs/current/New.md', 'Moved and renamed', 'Old', 'New'],
    ['Page.md', 'notes/Page.md', 'Moved', '(root)', 'notes'],
    ['notes/Page.md', 'Page.md', 'Moved', 'notes', '(root)'],
    ['docs/研究 old.md', 'docs/研究 new.md', 'Renamed', 'old', 'new'],
  ])('shows %s → %s with readable changes', (before, after, kind, removed, added) => {
    const { container } = render(<PathChange before={before} after={after} />);
    expect(screen.getByRole('group', { name: `${kind}: ${before} → ${after}` })).toBeInTheDocument();
    expect([...container.querySelectorAll('del')].some(element => element.textContent === removed)).toBe(true);
    expect([...container.querySelectorAll('ins')].some(element => element.textContent === added)).toBe(true);
  });

  it('keeps changed words whole and does not duplicate overlapping prefix and suffix', () => {
    expect(splitPathChange('t003 ---- old section.md', 't003 ---- new section.md')).toEqual({ prefix: 't003 ---- ', before: 'old', after: 'new', suffix: ' section.md' });
    expect(splitPathChange('page.md', 'page.md')).toEqual({ prefix: 'page.md', before: '', after: '', suffix: '' });
    expect(splitPathChange('A', 'AA')).toEqual({ prefix: '', before: 'A', after: 'AA', suffix: '' });
  });

  it('retains full long paths for accessible comparison while showing the shared directory once', () => {
    const directory = 'long-directory/'.repeat(20);
    render(<PathChange before={`${directory}old.md`} after={`${directory}new.md`} />);
    expect(screen.getByRole('group')).toHaveAttribute('title', `${directory}old.md → ${directory}new.md`);
    expect(screen.getByText(directory)).toBeInTheDocument();
  });
});
