/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoveTraversal } from '../../src/areas/bundle/sourcing/components/MoveTraversal.js';
import type { SourceMoveCandidate } from '../../../../contracts/types/sourcing.js';

const move: SourceMoveCandidate = {
  bundleNodeId: 'page', oldPath: 'old/page.md', newPath: 'new/page.md',
  confidence: 'strong', competing: false, evidence: [],
  previousRoute: ['root.md', 'parent.md', 'old/page.md'], currentRoute: ['root.md', 'parent.md', 'new/page.md'],
};

describe('move traversal context', () => {
  it('shows an unchanged leading route once and omits the moved endpoint', () => {
    render(<MoveTraversal move={move} />);
    expect(screen.getAllByTestId('source-file-pill').map(node => node.getAttribute('title'))).toEqual(['root.md', 'parent.md']);
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
    expect(screen.queryByText('After')).not.toBeInTheDocument();
    expect(screen.queryByTitle('old/page.md')).not.toBeInTheDocument();
    expect(screen.queryByTitle('new/page.md')).not.toBeInTheDocument();
  });

  it('keeps both routes when a different parent leads to the moved page', () => {
    render(<MoveTraversal move={{ ...move, currentRoute: ['root.md', 'different.md', 'new/page.md'] }} />);
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
    expect(screen.getByTitle('parent.md')).toBeInTheDocument();
    expect(screen.getByTitle('different.md')).toBeInTheDocument();
  });

  it('distinguishes an unrecorded route from a traversal starting at the page', () => {
    render(<MoveTraversal move={{ ...move, previousRoute: [], currentRoute: ['new/page.md'] }} />);
    expect(screen.getByText('No previously reachable route recorded.')).toBeInTheDocument();
    expect(screen.getByText('Traversal starts at this page.')).toBeInTheDocument();
  });
});
