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
    expect(within(panel).getByRole('radio', { name: 'Same' })).toBeChecked();
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
    fireEvent.click(within(screen.getByTestId('source-move-weak')).getByRole('radio', { name: /^Different$/ }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ weak: null });
  });

  it('keeps saved overrides selected and out of Accept all suggestions', () => {
    const actions = callbacks();
    render(<SourceIdentityReview moves={[move('a'), move('b')]} choices={{ a: null }} busy={false} tab="confident" {...actions} />);
    openRecord('a');
    expect(within(screen.getByTestId('source-move-a')).getByRole('radio', { name: /^Different$/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Accept all suggestions' }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ b: 'b-new.md' });
  });

  it('allows an individual click to confirm an already preselected suggestion', () => {
    const actions = callbacks();
    render(<SourceIdentityReview moves={[move('a')]} choices={{}} busy={false} tab="confident" {...actions} />);
    openRecord('a');
    fireEvent.click(screen.getByRole('radio', { name: /^Same$/ }));
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
    expect(summary).toHaveTextContent(/mwd\s*→\s*mwd\/mwd development/);
    expect(screen.getByRole('combobox', { name: 'Identity choice: Same, 4 files' })).toHaveValue('same');
    expect(summary).not.toHaveTextContent('files');
    expect(summary.querySelector('ins')).toHaveTextContent('mwd development');
    expect(summary.querySelector('del')).toBeNull();
    expect(summary.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getAllByRole('radio', { name: /^Same$/ })).toHaveLength(4);
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
    expect(screen.getByRole('radio', { name: /^Same$/ })).toBeChecked();
  });

  it('changes all files in a collapsed group using its compact choice', () => {
    const actions = callbacks();
    const moves = ['one', 'two'].map(id => ({ ...move(id), oldPath: `mwd/${id}.md`, newPath: `mwd/development/${id}.md` }));
    const view = render(<SourceIdentityReview moves={moves} choices={{}} busy={false} tab="confident" {...actions} />);
    const control = screen.getByRole('combobox', { name: 'Identity choice: Same, 2 files' });
    fireEvent.change(control, { target: { value: 'different' } });
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ one: null, two: null });
    expect(screen.getByTestId('source-identity-group')).not.toHaveAttribute('open');
    view.rerender(<SourceIdentityReview moves={moves} choices={{ one: null, two: null }} busy={false} tab="confident" {...actions} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Identity choice: Different, 2 files' }), { target: { value: 'same' } });
    expect(actions.choose).toHaveBeenLastCalledWith({ one: 'mwd/development/one.md', two: 'mwd/development/two.md' });
  });

  it('requires competing matches to be picked in details and keeps the side column read-only', () => {
    const actions = callbacks();
    const moves = [move('a', 0.55), { ...move('a', 0.5), newPath: 'other.md' }, { ...move('a', 0.5), newPath: 'third.md' }];
    const view = render(<SourceIdentityReview moves={moves} choices={{}} busy={false} tab="input" {...actions} />);
    const control = screen.getByTestId('source-identity-pick');
    expect(control).toHaveTextContent('Pick');
    fireEvent.click(control);
    expect(actions.choose).not.toHaveBeenCalled();
    expect(screen.getByRole('columnheader', { name: 'Choose' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByTestId('source-identity-direct-choices')).not.toBeInTheDocument();
    expect(screen.getByTestId('source-identity-record')).not.toHaveAttribute('open');
    openRecord('a');
    const record = screen.getByTestId('source-move-a');
    expect(within(record).getAllByRole('radio', { name: 'Pick' })).toHaveLength(3);
    expect(within(record).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
    fireEvent.click(within(within(record).getByRole('group', { name: 'Match with other.md' })).getByRole('radio', { name: 'Pick' }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ a: 'other.md' });
    view.rerender(<SourceIdentityReview moves={moves} choices={{ a: 'other.md' }} busy={false} tab="input" {...actions} />);
    expect(control).toHaveAccessibleName('Pick: match selected');
    expect(within(within(record).getByRole('group', { name: 'Match with other.md' })).getByRole('radio', { name: 'Pick' })).toBeChecked();
    fireEvent.click(within(record).getByRole('radio', { name: 'Different' }));
    expect(actions.choose).toHaveBeenLastCalledWith({ a: null });
    view.rerender(<SourceIdentityReview moves={moves} choices={{ a: null }} busy={false} tab="input" {...actions} />);
    expect(control).toHaveTextContent('Different');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('keeps an expanded group in place with stacked counts and changes only the chosen subset', () => {
    const actions = callbacks();
    const moves = ['one', 'two', 'three'].map(id => ({ ...move(id), oldPath: `mwd/${id}.md`, newPath: `mwd/development/${id}.md` }));
    const view = render(<SourceIdentityReview moves={moves} choices={{}} busy={false} tab="confident" {...actions} />);
    const group = screen.getByTestId('source-identity-group');
    fireEvent.click(screen.getByTestId('source-identity-group-summary'));
    fireEvent.click(within(screen.getByTestId('source-move-one')).getByRole('radio', { name: 'Different' }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ one: null });
    view.rerender(<SourceIdentityReview moves={moves} choices={{ one: null }} busy={false} tab="confident" {...actions} />);
    expect(screen.getByTestId('source-identity-group')).toBe(group);
    expect(group).toHaveAttribute('open');
    expect(screen.getAllByTestId('source-identity-row')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Identity choice: Same, 2 files' })).toHaveValue('same');
    const different = screen.getByRole('combobox', { name: 'Identity choice: Different, 1 file' });
    expect(different).toHaveValue('different');
    fireEvent.change(different, { target: { value: 'same' } });
    expect(actions.choose).toHaveBeenLastCalledWith({ one: 'mwd/development/one.md' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Identity choice: Same, 2 files' }), { target: { value: 'different' } });
    expect(actions.choose).toHaveBeenLastCalledWith({ two: null, three: null });
    view.rerender(<SourceIdentityReview moves={moves} choices={{ one: null, two: null, three: null }} busy={false} tab="confident" {...actions} />);
    expect(screen.getByTestId('source-identity-group')).toBe(group);
    expect(group).toHaveAttribute('open');
    expect(screen.getByRole('combobox', { name: 'Identity choice: Different, 3 files' })).toHaveValue('different');
    expect(screen.getAllByTestId('source-identity-choice')).toHaveLength(1);
  });

  it('counts unresolved group members separately and changes only that subset', () => {
    const actions = callbacks();
    const moves = ['one', 'two', 'three'].map(id => ({ ...move(id, 0.55), oldPath: `mwd/${id}.md`, newPath: `mwd/development/${id}.md` }));
    render(<SourceIdentityReview moves={moves} choices={{ one: 'mwd/development/one.md', two: null }} busy={false} tab="input" {...actions} />);
    expect(screen.getAllByTestId('source-identity-row')).toHaveLength(1);
    const controls = screen.getAllByTestId('source-identity-direct-choices');
    expect(within(controls[0]).getByRole('radio', { name: 'Same' })).toBeChecked();
    expect(within(controls[1]).getByRole('radio', { name: 'Different' })).toBeChecked();
    const unresolved = controls[2];
    expect(within(unresolved).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
    fireEvent.click(within(unresolved).getByRole('radio', { name: 'Same' }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ three: 'mwd/development/three.md' });
  });

  it('shows Choose above every input section and saves a choice without expanding its record', () => {
    const actions = callbacks();
    const moves = [
      { ...move('both', 0.55), oldPath: 'old/a.md', newPath: 'new/b.md' },
      { ...move('moved', 0.55), oldPath: 'old/c.md', newPath: 'new/c.md' },
      { ...move('renamed', 0.55), oldPath: 'old.md', newPath: 'new.md' },
    ];
    const view = render(<SourceIdentityReview moves={moves} choices={{}} busy={false} tab="input" {...actions} />);
    expect(screen.getAllByRole('columnheader', { name: 'Choose' })).toHaveLength(3);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    const control = screen.getAllByTestId('source-identity-direct-choices')[0];
    expect(within(control).getAllByRole('radio')).toHaveLength(2);
    expect(within(control).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
    fireEvent.click(within(control).getByRole('radio', { name: 'Different' }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ both: null });
    expect(within(screen.getByTestId('source-move-both')).getByTestId('source-identity-record')).not.toHaveAttribute('open');
    view.rerender(<SourceIdentityReview moves={moves} choices={{ both: null }} busy={false} tab="input" {...actions} />);
    const selected = screen.getAllByTestId('source-identity-direct-choices')[0];
    expect(within(selected).getByRole('radio', { name: 'Different' })).toBeChecked();
    fireEvent.click(within(selected).getByRole('radio', { name: 'Same' }));
    expect(actions.choose).toHaveBeenLastCalledWith({ both: 'new/b.md' });
  });
});
