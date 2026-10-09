/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useId, useState, type ReactNode } from 'react';
import type { SourceMoveCandidate } from '../../../../../../../contracts/types/sourcing.js';
import { sourceIdentityRecommendations, type SourceIdentityRecommendation } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { PathChange } from '../../../../shared/components/PathChange.js';
import { useSourcePathFormatter } from '../../../../shared/components/SourceNames.js';
import { MoveSimilarity } from './MoveSimilarity.js';
import { MoveTraversal } from './MoveTraversal.js';
import { groupSourceIdentities, identityChoice, identitySummaryMove, type IdentityChoice, type SourceIdentityGroup } from './groupSourceIdentities.js';

type Choices = Record<string, string | null>;
type Choose = (choices: Choices) => void;
type Compare = (move: SourceMoveCandidate) => void;

/**
 * What Confirm needs: how many uncertain files still need a choice, and the suggested choice for each likely
 * rename that has not been decided, which Confirm applies.
 */
export function identityConfirmation(moves: SourceMoveCandidate[], choices: Choices) {
  const records = sourceIdentityRecommendations(moves, choices);
  return {
    remaining: records.filter(record => !record.confident && !record.decided).length,
    defaults: Object.fromEntries(records.filter(record => record.confident && !record.decided).map(record => [record.id, record.destination ?? null])),
  };
}

/** The two answers for a renamed or moved file. Neither is pressed while undecided or mixed. */
function SamePageSwitch({ state, busy, label, onSame, onNew }: { state: IdentityChoice | 'mixed'; busy: boolean; label: string; onSame: () => void; onNew: () => void }) {
  const option = (pressed: boolean, text: string, onClick: () => void) => <button type="button" aria-pressed={pressed} disabled={busy} onClick={onClick}
    className={`px-2.5 py-1 text-xs font-medium focus-visible:relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-40 ${pressed ? 'bg-blue-700 text-white' : 'bg-white text-neutral-700 enabled:hover:bg-blue-50'}`}>{text}</button>;
  return <span role="group" aria-label={label} data-testid="source-identity-switch" data-current-choice={state}
    className="inline-flex shrink-0 overflow-hidden rounded border border-neutral-300 [&>button+button]:border-l [&>button+button]:border-neutral-300">
    {option(state === 'same', 'Same page', onSame)}{option(state === 'different', 'New page', onNew)}
  </span>;
}

function DetailsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <button type="button" aria-expanded={open} onClick={onToggle} data-testid="source-identity-details"
    className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">
    Details
    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className={open ? 'rotate-180' : undefined}><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
  </button>;
}

/** Why a file looks like the old one, with its content comparison when the content also changed. */
function MatchEvidence({ move, compare }: { move: SourceMoveCandidate; compare: Compare }) {
  return <div className="space-y-2">
    <p className="text-xs text-neutral-500">{move.evidence.join(' · ')}{move.contentChanged ? ' · Content also changed' : ''}</p>
    <MoveSimilarity move={move} />
    <MoveTraversal move={move} />
    {move.contentChanged && <button type="button" className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-semibold enabled:hover:bg-blue-50" onClick={() => compare(move)}>Compare content</button>}
  </div>;
}

/** One file with one likely match. */
function IdentityRow({ record, choices, busy, choose, compare }: { record: SourceIdentityRecommendation; choices: Choices; busy: boolean; choose: Choose; compare: Compare }) {
  const [open, setOpen] = useState(false);
  const move = record.moves[0];
  return <li data-testid={`source-move-${record.id}`} className="rounded border border-neutral-200">
    <div className="flex items-center gap-3 p-3">
      <span className="min-w-0 flex-1"><PathChange before={move.oldPath} after={move.newPath} /></span>
      <DetailsButton open={open} onToggle={() => setOpen(value => !value)} />
      <SamePageSwitch state={identityChoice(record, choices)} busy={busy} label={`Is ${move.newPath} the same page as ${move.oldPath}?`}
        onSame={() => choose({ [record.id]: move.newPath })} onNew={() => choose({ [record.id]: null })} />
    </div>
    {open && <div className="border-t border-neutral-100 p-3"><MatchEvidence move={move} compare={compare} /></div>}
  </li>;
}

/** One file with several possible matches: choose one of them, or none. */
function MatchChoiceRow({ record, choices, busy, choose, compare }: { record: SourceIdentityRecommendation; choices: Choices; busy: boolean; choose: Choose; compare: Compare }) {
  const name = useId();
  const format = useSourcePathFormatter();
  const [open, setOpen] = useState<string | null>(null);
  const selected = record.decided ? choices[record.id] : undefined;
  const radio = (checked: boolean, onChange: () => void, children: ReactNode) => <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
    <input type="radio" name={name} disabled={busy} checked={checked} onChange={onChange} />{children}</label>;
  return <li data-testid={`source-move-${record.id}`} className="rounded border border-neutral-200">
    <p className="border-b border-neutral-100 px-3 py-2 text-xs text-neutral-500">
      <span className="font-medium text-neutral-700">{record.moves[0].oldPath}</span> · {record.moves.length} possible matches
    </p>
    <ul className="divide-y divide-neutral-100">
      {record.moves.map(move => <li key={move.newPath} role="group" aria-label={`Match with ${format(move.newPath)}`} data-identity-destination={move.newPath}>
        <div className="flex items-center gap-3 px-3 py-2">
          {radio(selected === move.newPath, () => choose({ [record.id]: move.newPath }), <span className="min-w-0"><PathChange compact before={move.oldPath} after={move.newPath} /></span>)}
          <DetailsButton open={open === move.newPath} onToggle={() => setOpen(value => value === move.newPath ? null : move.newPath)} />
        </div>
        {open === move.newPath && <div className="px-3 pb-3 pl-9"><MatchEvidence move={move} compare={compare} /></div>}
      </li>)}
      <li className="px-3 py-2">{radio(selected === null, () => choose({ [record.id]: null }), <span>None of these — it’s a new page</span>)}</li>
    </ul>
  </li>;
}

/** Files that share one rename or move are decided together; Details lists each file with its own choice. */
function IdentityGroupRow({ group, choices, busy, choose, compare }: { group: SourceIdentityGroup; choices: Choices; busy: boolean; choose: Choose; compare: Compare }) {
  const [open, setOpen] = useState(false);
  const states = new Set(group.records.map(record => identityChoice(record, choices)));
  const state = states.size === 1 ? [...states][0] : 'mixed';
  // One real file shows the shared change; separate folder and name fragments read like duplicates.
  const example = identitySummaryMove(group.records[0], choices);
  const others = group.records.length - 1;
  return <li data-testid="source-identity-group" data-identity-ids={JSON.stringify(group.records.map(record => record.id))} className="rounded border border-neutral-200">
    <div className="flex items-center gap-3 p-3">
      <span className="min-w-0 flex-1 space-y-0.5">
        <PathChange before={example.oldPath} after={example.newPath} />
        <span className="block text-xs text-neutral-500">+ {others} more {others === 1 ? 'file' : 'files'} renamed the same way{state === 'mixed' ? ' · mixed choices' : ''}</span>
      </span>
      <DetailsButton open={open} onToggle={() => setOpen(value => !value)} />
      <SamePageSwitch state={state} busy={busy} label={`Are these ${group.records.length} files the same pages as before?`}
        onSame={() => choose(Object.fromEntries(group.records.map(record => [record.id, identitySummaryMove(record, choices).newPath])))}
        onNew={() => choose(Object.fromEntries(group.records.map(record => [record.id, null])))} />
    </div>
    {open && <ul className="space-y-2 border-t border-neutral-100 p-3">{group.records.map(record =>
      <IdentityRow key={record.id} record={record} choices={choices} busy={busy} choose={choose} compare={compare} />)}</ul>}
  </li>;
}

function IdentitySection({ title, note, decided = false, records, choices, busy, choose, compare }: { title: string; note: string; decided?: boolean; records: SourceIdentityRecommendation[]; choices: Choices; busy: boolean; choose: Choose; compare: Compare }) {
  const heading = useId();
  const groups = groupSourceIdentities(records, choices).flatMap(section => section.groups);
  return <section aria-labelledby={heading} data-testid={decided ? 'source-identities-decided' : undefined} className="space-y-2">
    <h3 id={heading} className="flex items-baseline gap-2 font-semibold text-neutral-800">{decided && <span aria-hidden="true" className="text-success-600">✓</span>}{title}<span className="text-sm font-normal text-neutral-500">{records.length}</span></h3>
    <p className="text-sm text-neutral-600">{note}</p>
    <ul className="space-y-2">{groups.map(group => group.records.length > 1
      ? <IdentityGroupRow key={group.key} group={group} choices={choices} busy={busy} choose={choose} compare={compare} />
      : group.records[0].moves.length > 1
        ? <MatchChoiceRow key={group.key} record={group.records[0]} choices={choices} busy={busy} choose={choose} compare={compare} />
        : <IdentityRow key={group.key} record={group.records[0]} choices={choices} busy={busy} choose={choose} compare={compare} />)}</ul>
  </section>;
}

/**
 * Files that left the bundle and new files that look like them. Uncertain files come first because they block the
 * graph; likely renames follow, already set to their suggested choice. Files decided before this visit are listed
 * last as already decided, still changeable. Only sections with files are shown.
 */
export function SourceIdentityReview({ moves, choices, busy, previouslyDecided = new Set(), choose, compare }: {
  moves: SourceMoveCandidate[]; choices: Choices; busy: boolean; previouslyDecided?: ReadonlySet<string>; choose: Choose; compare: Compare;
}) {
  const records = sourceIdentityRecommendations(moves, choices);
  const open = records.filter(record => !previouslyDecided.has(record.id)), decided = records.filter(record => previouslyDecided.has(record.id));
  const needsInput = open.filter(record => !record.confident), likely = open.filter(record => record.confident);
  return <div data-testid="source-identity-list" className="-mx-1 min-h-0 flex-1 space-y-6 overflow-y-auto px-1">
    {needsInput.length > 0 && <IdentitySection title="Choose a match" note="Several files could match, or the match is uncertain. Choose for each one."
      records={needsInput} choices={choices} busy={busy} choose={choose} compare={compare} />}
    {likely.length > 0 && <IdentitySection title="Likely renamed" note="We’re fairly sure these files were renamed or moved. Change any that aren’t."
      records={likely} choices={choices} busy={busy} choose={choose} compare={compare} />}
    {decided.length > 0 && <IdentitySection decided title="Already decided" note="You decided these earlier. Change any that need it."
      records={decided} choices={choices} busy={busy} choose={choose} compare={compare} />}
  </div>;
}
