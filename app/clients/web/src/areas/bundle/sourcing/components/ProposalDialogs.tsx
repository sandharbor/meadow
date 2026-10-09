/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useRef, useState } from 'react';
import { SourceIdentityReview, identityConfirmation } from './SourceIdentityReview.js';
import { sourceIdentityRecommendations } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { SourcingComponentContentComparison } from '../../shared-sourcing-curation/exported.js';
import type { SourcingTypeEditorOperations } from '../../shared-sourcing-curation/exported.js';
import Modal from '../../../../shared/components/Modal.js';
import type { SourceProposalReview } from '../../../../../../../contracts/types/sourcingProposal.js';
import { SourcePath } from './SourceReviewPresentation.js';
import { ChipPanel } from './ChipPanel.js';
import { proposalSettingLabels } from './ProposalSettingsSummary.js';
import { bundleNodeKeySourceGraphPath, parseBundleNodeKey } from '../../../../../../../shared_code/utils/bundleNodeKey.js';

const buttonStyle = 'rounded border px-3 py-2 font-semibold cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-40';
const secondaryButtonStyle = `${buttonStyle} border-neutral-300 bg-white text-neutral-700 enabled:hover:border-blue-300 enabled:hover:bg-blue-50`;
const primaryButtonStyle = `${buttonStyle} border-blue-700 bg-blue-700 text-white enabled:hover:border-blue-800 enabled:hover:bg-blue-800`;

function conflictTitle(review: SourceProposalReview, path: string[]): string {
  const [collection, id, ...fields] = path;
  const configurations = [review.configuration, review.proposal.proposed, review.proposal.original];
  const node = collection === 'nodes' ? configurations.flatMap(value => value.nodes).find(value => value.bundleNodeId === id) : undefined;
  const filter = collection === 'filters' ? configurations.flatMap(value => [...value.globalFilters, ...value.bundleFilters]).find(value => value.id === id) : undefined;
  const name = node?.bundleNodeName ?? filter?.name ?? (collection === 'bundle' ? 'Bundle' : 'Settings');
  const properties = collection === 'bundle' ? path.slice(1) : fields;
  return [name, ...properties.map(field => proposalSettingLabels[field] ?? field.replace(/([A-Z])/g, ' $1'))].join(' · ');
}

function conflictValue(value: unknown): string {
  if (value === undefined) return 'Removed';
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (Array.isArray(value)) return value.map(conflictValue).join('; ') || 'None';
  if (typeof value === 'object') return Object.entries(value).filter(([key]) => !['id', 'bundleNodeId', 'createdAt', 'updatedAt', 'trackingEvidence'].includes(key))
    .map(([key, item]) => `${proposalSettingLabels[key] ?? key.replace(/([A-Z])/g, ' $1')}: ${conflictValue(item)}`).join('\n');
  return String(value);
}

export type ProposalDialog = 'identities' | 'conflicts' | 'sensitivity' | 'refresh' | 'exit' | null;

export function ProposalDialogs({ dialog, review, busy, close, later, discard, mutate, refresh, request, identityRequired, identityComparison, onIdentityComparison, identityChoices, chooseIdentities, identitySaving, identityBusy }: {
  /** Whether this identity review visit is required; it stays so until the panel closes. */
  identityRequired: boolean;
  identityChoices: Record<string, string | null>; chooseIdentities: (choices: Record<string, string | null>) => void;
  identitySaving: boolean; identityBusy: boolean;
  identityComparison?: string; onIdentityComparison: (value: string | undefined) => void;
  request: SourcingTypeEditorOperations['request'];
  dialog: ProposalDialog; review: SourceProposalReview; busy: boolean;
  close: () => void; later: () => void; discard: () => void; refresh: () => void;
  mutate: (operation: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  // While identities are unresolved, identity review is required: each choice saves as it is made, so Cancel can
  // leave review without losing them. Once everything is decided, a revisit edits a draft that Update applies and
  // Cancel discards, closing only the panel.
  const required = identityRequired;
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const edits = Object.fromEntries(Object.entries(draft).filter(([id, value]) => identityChoices[id] !== value));
  const shownChoices = required ? identityChoices : { ...identityChoices, ...draft };
  useEffect(() => { if (dialog !== 'identities') setDraft({}); }, [dialog]);
  // A refresh that brings undecided files makes review required again; edits in progress are kept by saving them.
  useEffect(() => {
    if (!required || !Object.keys(draft).length) return;
    chooseIdentities(draft); setDraft({});
  }, [required, draft, chooseIdentities]);
  // Files decided before this visit, or before the files under review last changed, are listed apart as already decided.
  const choicesRef = useRef(identityChoices);
  choicesRef.current = identityChoices;
  const reviewedIds = [...new Set(review.moves.map(move => move.bundleNodeId))].sort().join();
  const [previouslyDecided, setPreviouslyDecided] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (dialog !== 'identities') return;
    setPreviouslyDecided(new Set(sourceIdentityRecommendations(review.moves, choicesRef.current).filter(record => record.decided).map(record => record.id)));
    // Only opening the panel or a change in the files under review takes a new snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, reviewedIds]);
  // Confirm applies the suggested choice to each untouched likely rename, then continues once every choice is saved.
  const confirmation = identityConfirmation(review.moves, identityChoices);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming || identitySaving || identityBusy || review.unresolvedIdentities.length) return;
    setConfirming(false);
    close();
  }, [confirming, identitySaving, identityBusy, review.unresolvedIdentities.length, close]);
  const confirm = () => {
    if (Object.keys(confirmation.defaults).length) chooseIdentities(confirmation.defaults);
    setConfirming(true);
  };
  const update = () => {
    chooseIdentities(edits); setDraft({});
    setConfirming(true);
  };
  const comparedMove = dialog === 'identities' ? review.moves.find(move => JSON.stringify([move.bundleNodeId, move.newPath]) === identityComparison) : undefined;
  const comparison = comparedMove ? { kind: 'moved' as const, orphanedConfiguration: false, explanation: 'Proposed identity correspondence', previousPath: comparedMove.oldPath, proposedPath: comparedMove.newPath, previousRoute: comparedMove.previousRoute, proposedRoute: comparedMove.currentRoute, beforeSnapshotId: review.accepted.id, afterSnapshotId: review.candidate.id } : undefined;
  const pendingTracking = Object.entries(review.proposal.tracking).filter(([, decision]) => decision.needsConfirmation || decision.invalidated);
  return <>
    {/* Identity review opens from its chip. While identities are unresolved the graph cannot open, so the panel
        is modal: the rest of the screen dims and only Cancel or Confirm leave it. The bar stays above the
        dimming, so its refresh still updates the proposal. */}
    {dialog === 'identities' && <ChipPanel anchor='[data-change-item="identities"]' label="Source identities" role="dialog" modal={required}
      afterChipFade={required} onDismiss={close}
      className="h-[min(70vh,44rem)] w-[min(48rem,calc(100vw-2rem))]">
      <header className="flex shrink-0 items-center gap-3 rounded-t-lg border-b border-neutral-100 px-5 py-3">
        <h2 className="text-lg font-semibold">Source identities</h2>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
        <div className="mb-4 shrink-0 space-y-1">
          <p>Some files that were part of this bundle are gone, and new files look like them.</p>
          <p className="text-sm text-neutral-600"><strong className="font-semibold text-neutral-800">Same page</strong> keeps the page’s tracking and settings. <strong className="font-semibold text-neutral-800">New page</strong> removes the old page and starts the new file fresh.</p>
        </div>
        <SourceIdentityReview moves={review.moves} choices={shownChoices} busy={identityBusy || confirming} previouslyDecided={previouslyDecided}
          choose={required ? chooseIdentities : choices => setDraft(current => ({ ...current, ...choices }))} compare={move => onIdentityComparison(JSON.stringify([move.bundleNodeId, move.newPath]))} />
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-neutral-100 px-5 py-3">
        <span role="status" className="mr-auto text-sm text-neutral-500">{identitySaving ? 'Saving choices…'
          : confirmation.remaining ? `Choose a match for ${confirmation.remaining} more ${confirmation.remaining === 1 ? 'file' : 'files'}.` : ''}</span>
        {required ? <>
          {/* Cancel leaves review; choices made so far are kept with the proposal, and nothing applies until Accept changes. */}
          <button className={secondaryButtonStyle} onClick={later}>Cancel</button>
          <button className={primaryButtonStyle} disabled={busy || confirming || confirmation.remaining > 0} onClick={confirm}>Confirm</button>
        </> : <>
          <button className={secondaryButtonStyle} onClick={close}>Cancel</button>
          <button className={primaryButtonStyle} disabled={busy || confirming || !Object.keys(edits).length} onClick={update}>Update</button>
        </>}
      </footer>
    </ChipPanel>}
    <Modal isOpen={dialog === 'conflicts'} title="Resolve configuration conflicts" onClose={close}>
      <p className="mb-4">Saved settings changed while this proposal was pending. Choose which value to accept for each conflict.</p>
      {review.conflicts.map(conflict => <section key={JSON.stringify(conflict.path)} className="mb-4 rounded border p-3">
        <h3 className="font-semibold">{conflictTitle(review, conflict.path)}</h3>
        <div className="grid grid-cols-3 gap-3 text-xs">{(['original', 'saved', 'proposed'] as const).map(side => <div key={side}><h4 className="capitalize">{side}</h4><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{conflictValue(conflict[side])}</pre></div>)}</div>
        <div className="mt-3 flex flex-wrap gap-3">{(['saved', 'proposed'] as const).map(choice => <button key={choice} className={secondaryButtonStyle} disabled={busy} onClick={() => void mutate('conflicts', { reviewToken: review.reviewToken, choices: [{ path: conflict.path, choice }] })}>Use {choice}</button>)}</div>
      </section>)}
      {review.conflicts.length === 0 && <p>All conflicts resolved.</p>}
    </Modal>
    <Modal isOpen={dialog === 'sensitivity'} title="Review tracking sensitivity" onClose={close}>
      <p className="mb-4">The material, page identity, or sensitivity policy changed after your explicit tracking choice. Review the current evidence before keeping it tracked.</p>
      {pendingTracking.map(([key, decision]) => <section key={key} className="mb-4 rounded border p-3">
        <SourcePath value={bundleNodeKeySourceGraphPath(parseBundleNodeKey(key))} /><p className="text-sm">{decision.invalidated ?? review.trackingTargets[key]?.sensitivityReasons?.join(' ') ?? 'This page is sensitive under the current policy.'}</p>
        <div className="mt-3 flex flex-wrap gap-3"><button className={secondaryButtonStyle} disabled={busy} onClick={() => void mutate('tracking', { nodeKeys: [key], track: false })}>Leave untracked</button>
          {review.trackingTargets[key] && <button className={primaryButtonStyle} disabled={busy} onClick={() => void mutate('tracking', { nodeKeys: [key], track: true, confirmSensitive: true })}>{decision.identityChanged ? 'Confirm tracking current page' : 'Confirm tracking sensitive page'}</button>}</div>
      </section>)}
      {pendingTracking.length === 0 && <p>All tracking choices reviewed.</p>}
    </Modal>
    <Modal isOpen={dialog === 'exit'} title="Exit changes review" onClose={close} className="h-auto w-full max-w-md" footer={<div className="flex flex-wrap justify-end gap-3">
      <button className={secondaryButtonStyle} disabled={busy} onClick={close}>Cancel</button>
      <button className={secondaryButtonStyle} disabled={busy} onClick={discard}>Discard changes</button>
      <button className={primaryButtonStyle} disabled={busy} onClick={later}>Keep changes</button>
    </div>}>
      <p>Keep your changes to finish later, or discard them?</p>
    </Modal>
    <Modal isOpen={dialog === 'refresh'} title="Update sources for this change?" onClose={close} className="h-auto w-full max-w-lg" footer={<div className="flex flex-wrap justify-end gap-3"><button className={secondaryButtonStyle} disabled={busy} onClick={close}>Cancel</button><button className={primaryButtonStyle} disabled={busy} onClick={refresh}>Update sources and apply change</button></div>}>
      <p>Newer source material is available. Applying this traversal change will update the capture being reviewed. Cancel keeps the previous capture and settings.</p>
    </Modal>
    {comparison && <SourcingComponentContentComparison evidence={comparison} request={request} onClose={() => onIdentityComparison(undefined)} />}
  </>;
}
