/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DiffView from '../../shared_components/ConfigFileExplorer/DiffView.js';

describe('shared code diff for captured source content', () => {
  it('shows a changed link as a deletion and addition with both line numbers', () => {
    render(<DiffView originalContent={'First paragraph\n[[Child page]]\nLast paragraph'} currentContent={'First paragraph\nChild page (link removed)\nLast paragraph'} isNewFile={false} codeOnly wrapLines lineLabels={{ before: 'Accepted source', after: 'Candidate source' }} />);
    const table = screen.getByRole('table', { name: 'Accepted source to Candidate source' });
    const removed = within(table).getByRole('row', { name: /\[\[Child page\]\]/ });
    const added = within(table).getByRole('row', { name: /link removed/ });
    expect(removed).toHaveAttribute('data-change', 'removed');
    expect(added).toHaveAttribute('data-change', 'added');
    expect(within(removed).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['2', '', '-', '[[Child page]]']);
    expect(within(added).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['', '2', '+', 'Child page (link removed)']);
  });

  it.each([
    [null, 'New page', true, false, 'added'],
    ['Removed page', '', false, true, 'removed'],
  ] as const)('handles an absent source without inventing an empty line', (before, after, isNewFile, isDeletedFile, kind) => {
    render(<DiffView originalContent={before} currentContent={after} isNewFile={isNewFile} isDeletedFile={isDeletedFile} codeOnly />);
    const rows = screen.getAllByRole('row').filter(row => row.hasAttribute('data-change'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-change', kind);
  });

  it('reports identical contents for a rename', () => {
    render(<DiffView originalContent="Same page" currentContent="Same page" isNewFile={false} codeOnly unchangedLabel="No content changes" />);
    expect(screen.getByText('No content changes')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Same page/ })).toHaveAttribute('data-change', 'unchanged');
  });

  it('expands the unchanged context around a change', () => {
    const before = Array.from({ length: 30 }, (_, i) => `Context ${i}`).join('\n');
    render(<DiffView originalContent={before} currentContent={before.replace('Context 15\n', 'Changed paragraph\n')} isNewFile={false} codeOnly />);
    expect(screen.queryByText('Context 0')).not.toBeInTheDocument();
    expect(screen.getByText('Changed paragraph')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByText('Context 0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByText('Context 0')).not.toBeInTheDocument();
  });

  it('keeps HTML source literal while preserving the preview’s Text/Code choice', () => {
    const before = '<html><body>Before</body></html>';
    const after = '<html><body><img src=x onerror="alert(1)">After</body></html>';
    const { container, rerender } = render(<DiffView originalContent={before} currentContent={after} isNewFile={false} codeOnly />);
    expect(screen.getByText(after)).toBeInTheDocument();
    expect(container.querySelector('img, iframe')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Code' })).not.toBeInTheDocument();
    rerender(<DiffView originalContent={before} currentContent={after} isNewFile={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(screen.getByText(after)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument();
  });

  it.each([true, false])('shows precise highlights in source review and HTML Code view (codeOnly=%s)', codeOnly => {
    const before = '<html><body>Page 001</body></html>';
    const after = '<html><body>Page 101</body></html>';
    const { container } = render(<DiffView originalContent={before} currentContent={after} isNewFile={false} codeOnly={codeOnly} />);
    if (!codeOnly) fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(container.querySelector('[data-inline-change="removed"]')).toHaveTextContent('0');
    expect(container.querySelector('[data-inline-change="added"]')).toHaveTextContent('1');
    expect(container.querySelector('[data-change="removed"] td:last-child')).toHaveTextContent(before);
    expect(container.querySelector('[data-change="added"] td:last-child')).toHaveTextContent(after);
    expect(container.querySelector('iframe, body body')).toBeNull();
  });

  it('keeps whole-line shading for substantial rewrites', () => {
    const { container } = render(<DiffView originalContent="abcdefghij" currentContent="abcXYZghij" isNewFile={false} codeOnly />);
    expect(container.querySelectorAll('[data-inline-change]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-change="added"], [data-change="removed"]')).toHaveLength(2);
  });

  it('handles a large replacement without allocating a quadratic comparison table', () => {
    const before = Array.from({ length: 2100 }, (_, i) => `Old ${i}`).join('\n');
    const after = Array.from({ length: 2100 }, (_, i) => `New ${i}`).join('\n');
    render(<DiffView originalContent={before} currentContent={after} isNewFile={false} codeOnly />);
    expect(screen.getByText('+2100')).toBeInTheDocument();
    expect(screen.getByText('-2100')).toBeInTheDocument();
  });
});
