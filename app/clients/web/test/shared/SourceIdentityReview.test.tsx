/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SourceIdentityReview, identityConfirmation } from '../../src/areas/bundle/sourcing/components/SourceIdentityReview.js';
import type { SourceMoveCandidate } from '../../../../contracts/types/sourcing.js';

const move = (id: string, score = 0.9): SourceMoveCandidate => ({ bundleNodeId: id, oldPath: `${id}.md`, newPath: `${id}-new.md`, similarity: { score, criteria: [] }, confidence: 'strong', competing: false, evidence: ['Identical non-blank file contents'], previousRoute: [], currentRoute: [] });
const callbacks = () => ({ choose: vi.fn(), compare: vi.fn() });
const section = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) });
type Rendered = ReturnType<typeof screen.getByTestId>;
const pressed = (record: Rendered) => within(record).getAllByRole('button', { pressed: true }).map(button => button.textContent);

describe('source identity review', () => {
  it('lists uncertain files to choose first and likely renames after them, showing only sections with files', () => {
    const { rerender } = render(<SourceIdentityReview moves={[move('a'), move('weak', 0.55)]} choices={{}} busy={false} {...callbacks()} />);
    expect(within(section('Choose a match')).getByTestId('source-move-weak')).toBeVisible();
    expect(within(section('Likely renamed')).getByTestId('source-move-a')).toBeVisible();
    expect(screen.getAllByRole('region').map(region => region.querySelector('h3')?.textContent)).toEqual(['Choose a match1', 'Likely renamed1']);
    rerender(<SourceIdentityReview moves={[move('a')]} choices={{}} busy={false} {...callbacks()} />);
    expect(screen.queryByRole('region', { name: /^Choose a match/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('shows a likely rename as Same page without saving it until the file is changed', () => {
    const actions = callbacks();
    render(<SourceIdentityReview moves={[move('a')]} choices={{}} busy={false} {...actions} />);
    const record = screen.getByTestId('source-move-a');
    expect(pressed(record)).toEqual(['Same page']);
    expect(actions.choose).not.toHaveBeenCalled();
    fireEvent.click(within(record).getByRole('button', { name: 'New page' }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ a: null });
  });

  it('leaves an uncertain file undecided and shows its evidence under Details', () => {
    const actions = callbacks();
    render(<SourceIdentityReview moves={[move('weak', 0.55)]} choices={{}} busy={false} {...actions} />);
    const record = screen.getByTestId('source-move-weak');
    expect(within(record).queryAllByRole('button', { pressed: true })).toHaveLength(0);
    expect(within(record).queryByText('Similarity 55/100 · Show criteria')).not.toBeInTheDocument();
    fireEvent.click(within(record).getByRole('button', { name: 'Details' }));
    expect(within(record).getByText('Similarity 55/100 · Show criteria')).toBeVisible();
    expect(within(record).getByText('Traversal details')).toBeVisible();
    fireEvent.click(within(record).getByRole('button', { name: 'Same page' }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ weak: 'weak-new.md' });
  });

  it('lists competing matches as options with a new-page choice and no default', () => {
    const actions = callbacks();
    const moves = [move('a', 0.55), { ...move('a', 0.5), newPath: 'other.md' }, { ...move('a', 0.5), newPath: 'third.md' }];
    render(<SourceIdentityReview moves={moves} choices={{}} busy={false} {...actions} />);
    const record = screen.getByTestId('source-move-a');
    expect(record).toHaveTextContent('3 possible matches');
    expect(within(record).getAllByRole('radio')).toHaveLength(4);
    expect(within(record).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
    fireEvent.click(within(record.querySelector('li[data-identity-destination="other.md"]') as Rendered).getByRole('radio'));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ a: 'other.md' });
    fireEvent.click(within(record).getByRole('radio', { name: 'None of these — it’s a new page' }));
    expect(actions.choose).toHaveBeenLastCalledWith({ a: null });
  });

  it('decides files sharing one rename together, showing one example and each file under Details', () => {
    const actions = callbacks();
    const moves = ['one', 'two', 'three'].map(id => ({ ...move(id), oldPath: `mwd/${id}.md`, newPath: `mwd/development/${id}.md` }));
    const view = render(<SourceIdentityReview moves={moves} choices={{}} busy={false} {...actions} />);
    const group = screen.getByTestId('source-identity-group');
    expect(within(group).getAllByRole('group', { name: /→/ })[0]).toHaveAccessibleName('Moved: mwd/one.md → mwd/development/one.md');
    expect(group).toHaveTextContent('+ 2 more files renamed the same way');
    expect(screen.queryByTestId('source-move-two')).not.toBeInTheDocument();
    fireEvent.click(within(group).getAllByRole('button', { name: 'New page' })[0]);
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ one: null, two: null, three: null });
    view.rerender(<SourceIdentityReview moves={moves} choices={{ one: null }} busy={false} {...actions} />);
    expect(group).toHaveTextContent('mixed choices');
    fireEvent.click(within(group).getByRole('button', { name: 'Details' }));
    expect(within(group).getAllByTestId(/^source-move-/)).toHaveLength(3);
  });

  it('lists files decided before this visit as already decided, wherever their confidence would place them', () => {
    const actions = callbacks();
    render(<SourceIdentityReview moves={[move('a'), move('weak', 0.55), move('new', 0.55)]} choices={{ a: 'a-new.md', weak: null }} busy={false}
      previouslyDecided={new Set(['a', 'weak'])} {...actions} />);
    expect(within(section('Choose a match')).getAllByTestId(/^source-move-/).map(record => record.dataset.testid)).toEqual(['source-move-new']);
    expect(screen.queryByRole('region', { name: /^Likely renamed/ })).not.toBeInTheDocument();
    const decided = section('Already decided');
    expect(pressed(within(decided).getByTestId('source-move-a'))).toEqual(['Same page']);
    expect(pressed(within(decided).getByTestId('source-move-weak'))).toEqual(['New page']);
    fireEvent.click(within(within(decided).getByTestId('source-move-weak')).getByRole('button', { name: 'Same page' }));
    expect(actions.choose).toHaveBeenCalledExactlyOnceWith({ weak: 'weak-new.md' });
  });

  it('counts the uncertain files still to choose and the suggestions Confirm applies', () => {
    const moves = [move('a'), move('b'), move('weak', 0.55), move('other', 0.55)];
    expect(identityConfirmation(moves, {})).toEqual({ remaining: 2, defaults: { a: 'a-new.md', b: 'b-new.md' } });
    expect(identityConfirmation(moves, { a: null, weak: 'weak-new.md' })).toEqual({ remaining: 1, defaults: { b: 'b-new.md' } });
  });
});
