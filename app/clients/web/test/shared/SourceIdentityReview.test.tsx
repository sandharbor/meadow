/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SourceIdentityReview } from '../../src/areas/bundle/sourcing/components/SourceIdentityReview.js';
import type { SourceMoveCandidate } from '../../../../contracts/types/sourcing.js';

const move = (id: string, score = 0.9): SourceMoveCandidate => ({ bundleNodeId: id, oldPath: `${id}.md`, newPath: `${id}-new.md`, similarity: { score, criteria: [] }, confidence: 'strong', competing: false, evidence: ['Identical non-blank file contents'], previousRoute: [], currentRoute: [] });
function openRecord(id: string) {
  const record = screen.getByTestId(`source-move-${id}`);
  const group = record.closest('details');
  if (group && !group.open) fireEvent.click(group.querySelector('summary')!);
  const summary = within(record).queryByTestId('source-identity-record-summary');
  if (summary) fireEvent.click(summary);
}

const callbacks = () => ({ choose: vi.fn(), compare: vi.fn(), onTabChange: vi.fn() });

describe('source identity review tabs', () => {
  it('preselects confident suggestions without saving them until they are accepted', () => {
    const actions = callbacks();
    render(<SourceIdentityReview moves={[move('a'), move('weak', 0.55)]} choices={{}} busy={false} tab="confident" {...actions} />);
    const panel = screen.getByRole('tabpanel', { name: 'Confident suggestions' });
    openRecord('a');
    expect(within(panel).getByRole('radio', { name: 'Same page — a-new.md' })).toBeChecked();
    expect(within(panel).getByText('Recommended')).toBeVisible();
    expect(actions.choose).not.toHaveBeenCalled();
    expect(screen.queryByText('Review the selected suggestions, then accept them together.')).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Accept all suggestions' }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ a: 'a-new.md' });
  });

  it('shows uncertain choices and evidence without a recommendation or selected default', () => {
    const actions = callbacks();
    render(<SourceIdentityReview moves={[move('a'), move('weak', 0.55)]} choices={{}} busy={false} tab="input" {...actions} />);
    const panel = screen.getByRole('tabpanel', { name: 'Needs your input' });
    openRecord('weak');
    expect(within(panel).queryByText('Recommended')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
    expect(within(panel).getByText('Similarity 55/100 · Show criteria')).toBeVisible();
    expect(within(panel).getByText('Traversal details')).toBeVisible();
    fireEvent.click(within(panel).getByRole('radio', { name: /Different pages/ }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ weak: null });
  });

  it('keeps saved overrides selected and out of Accept all suggestions', () => {
    const actions = callbacks();
    render(<SourceIdentityReview moves={[move('a'), move('b')]} choices={{ a: null }} busy={false} tab="confident" {...actions} />);
    openRecord('a');
    expect(within(screen.getByTestId('source-move-a')).getByRole('radio', { name: /Different pages/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Accept all suggestions' }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ b: 'b-new.md' });
  });

  it('allows an individual click to confirm an already preselected suggestion', () => {
    const actions = callbacks();
    render(<SourceIdentityReview moves={[move('a')]} choices={{}} busy={false} tab="confident" {...actions} />);
    openRecord('a');
    fireEvent.click(screen.getByRole('radio', { name: /Same page/ }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ a: 'a-new.md' });
  });

  it('supports keyboard tab switching and focus', () => {
    const actions = callbacks();
    render(<SourceIdentityReview moves={[move('a')]} choices={{}} busy={false} tab="confident" {...actions} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Confident suggestions' }), { key: 'ArrowRight' });
    expect(actions.onTabChange).toHaveBeenCalledWith('input');
    expect(screen.getByRole('tab', { name: 'Needs your input' })).toHaveFocus();
  });
});


describe('source identity change overviews', () => {
  it('collapses four shared directory changes into one overview', () => {
    const actions = callbacks();
    const moves = ['one', 'two', 'three', 'four'].map(id => ({ ...move(id), oldPath: `mwd/${id}.md`, newPath: `mwd/mwd development/${id}.md` }));
    render(<SourceIdentityReview moves={moves} choices={{}} busy={false} tab="confident" {...actions} />);
    expect(screen.getByRole('heading', { name: 'Changed directories' })).toBeVisible();
    const summary = screen.getByTestId('source-identity-group-summary');
    expect(summary).toHaveTextContent(/mwd\s*→\s*mwd\/mwd development\s*— 4 files/);
    expect(summary.querySelector('ins')).toHaveTextContent('mwd development');
    expect(summary.querySelector('del')).toBeNull();
    expect(summary.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getAllByRole('radio', { name: /Same page/ })).toHaveLength(4);
    expect(screen.getAllByText('Recommended')).toHaveLength(4);
  });

  it('shows the full file change for a singleton and opens its decisions on demand', () => {
    const actions = callbacks();
    render(<SourceIdentityReview moves={[{ ...move('a'), oldPath: 'mwd/old.md', newPath: 'mwd/development/new.md' }]} choices={{}} busy={false} tab="confident" {...actions} />);
    expect(screen.getByRole('heading', { name: 'Changed directories and renamed' })).toBeVisible();
    expect(within(screen.getByTestId('source-identity-record-summary')).getByRole('group')).toHaveAccessibleName('Moved and renamed: mwd/old.md → mwd/development/new.md');
    expect(screen.getByTestId('source-identity-record')).not.toHaveAttribute('open');
    openRecord('a');
    expect(screen.getByTestId('source-identity-record')).toHaveAttribute('open');
    expect(screen.getByRole('radio', { name: /Same page/ })).toBeChecked();
  });
});
