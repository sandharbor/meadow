/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { PathChange } from '../../../../shared/components/PathChange.js';
import { OrphanReview } from './OrphanReview.js';
import { MoveTraversal } from './MoveTraversal.js';
import { SourcingComponentContentComparison } from '../../shared-sourcing-curation/exported.js';
import type { SourcingTypeEditorOperations } from '../../shared-sourcing-curation/exported.js';
import Modal from '../../../../shared/components/Modal.js';
import type { SourceProposalReview } from '../../../../../../../contracts/types/sourcingProposal.js';
import { SourcePath } from './SourceReviewPresentation.js';
import { proposalSettingLabels } from './ProposalSettingsSummary.js';
import { bundleNodeKeySourceGraphPath, parseBundleNodeKey } from '../../../../../../../shared_code/utils/bundleNodeKey.js';

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

export type ProposalDialog = 'identities' | 'conflicts' | 'sensitivity' | 'refresh' | 'cleanup' | null;

export function ProposalDialogs({ dialog, review, busy, close, later, mutate, refresh, request, identityComparison, onIdentityComparison }: {
  identityComparison?: string; onIdentityComparison: (value: string | undefined) => void;
  request: SourcingTypeEditorOperations['request'];
  dialog: ProposalDialog; review: SourceProposalReview; busy: boolean;
  close: () => void; later: () => void; refresh: () => void;
  mutate: (operation: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const comparedMove = dialog === 'identities' ? review.moves.find(move => JSON.stringify([move.bundleNodeId, move.newPath]) === identityComparison) : undefined;
  const comparison = comparedMove ? { kind: 'moved' as const, orphanedConfiguration: false, explanation: 'Proposed identity correspondence', previousPath: comparedMove.oldPath, proposedPath: comparedMove.newPath, previousRoute: comparedMove.previousRoute, proposedRoute: comparedMove.currentRoute, beforeSnapshotId: review.accepted.id, afterSnapshotId: review.candidate.id } : undefined;
  const groups = new Map<string, SourceProposalReview['moves']>();
  for (const move of review.moves) groups.set(move.bundleNodeId, [...(groups.get(move.bundleNodeId) ?? []), move]);
  const unambiguous = [...groups].filter(([, moves]) => moves.length === 1 && !moves[0].competing);
  const identities = (choices: Record<string, string | null>) => void mutate('identities', { choices });
  const pendingTracking = Object.entries(review.proposal.tracking).filter(([, decision]) => decision.needsConfirmation || decision.invalidated);
  return <>
    <Modal isOpen={dialog === 'identities'} title="Source identities" onClose={later} footer={<div className="flex justify-end gap-3">
      <button disabled={busy} onClick={() => void mutate('refresh', {})}>Update sources</button><button onClick={later}>Later</button><button disabled={busy || review.unresolvedIdentities.length > 0} onClick={close}>Continue to graph</button>
    </div>}>
      <p className="mb-4">Decide which pages keep their identity and saved settings. These choices remain editable until acceptance.</p>
      {unambiguous.length > 0 && <button className="mb-4 rounded border p-2" disabled={busy} onClick={() => identities(Object.fromEntries(unambiguous.map(([id, moves]) => [id, moves[0].newPath])))}>Confirm {unambiguous.length} unambiguous suggestions</button>}
      {[...groups].map(([id, moves]) => <fieldset key={id} disabled={busy} className="mb-4 space-y-2 rounded border p-3" data-testid={`source-move-${id}`}>
        <legend><SourcePath value={moves[0].oldPath} /></legend>
        {moves.map(move => <div key={move.newPath} className="space-y-2">
          <PathChange before={move.oldPath} after={move.newPath} />
          <label className="flex gap-2"><input type="radio" name={id} checked={review.proposal.identities[id] === move.newPath} onChange={() => identities({ [id]: move.newPath })} />Same page — <SourcePath value={move.newPath} /></label>
          <p className="pl-6 text-xs text-neutral-500">{move.evidence.join(' · ')}{move.contentChanged ? ' · Content also changed' : ''}</p>
          <MoveTraversal move={move} />
          {move.contentChanged && <button className="pl-6 text-xs underline" onClick={() => onIdentityComparison(JSON.stringify([move.bundleNodeId, move.newPath]))}>Compare content</button>}
        </div>)}
        <label className="flex gap-2"><input type="radio" name={id} checked={review.proposal.identities[id] === null} onChange={() => identities({ [id]: null })} />Different pages — remove the old configuration at acceptance</label>
      </fieldset>)}
    </Modal>
    <Modal isOpen={dialog === 'cleanup'} title="Configuration cleanup" onClose={close}><OrphanReview orphans={review.orphans} hasCandidate /></Modal>
    <Modal isOpen={dialog === 'conflicts'} title="Resolve configuration conflicts" onClose={close}>
      <p className="mb-4">Saved settings changed while this proposal was pending. Choose which value to accept for each conflict.</p>
      {review.conflicts.map(conflict => <section key={JSON.stringify(conflict.path)} className="mb-4 rounded border p-3">
        <h3 className="font-semibold">{conflictTitle(review, conflict.path)}</h3>
        <div className="grid grid-cols-3 gap-3 text-xs">{(['original', 'saved', 'proposed'] as const).map(side => <div key={side}><h4 className="capitalize">{side}</h4><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{conflictValue(conflict[side])}</pre></div>)}</div>
        <div className="mt-3 flex gap-3">{(['saved', 'proposed'] as const).map(choice => <button key={choice} className="rounded border p-2" disabled={busy} onClick={() => void mutate('conflicts', { reviewToken: review.reviewToken, choices: [{ path: conflict.path, choice }] })}>Use {choice}</button>)}</div>
      </section>)}
      {review.conflicts.length === 0 && <p>All conflicts resolved.</p>}
    </Modal>
    <Modal isOpen={dialog === 'sensitivity'} title="Review tracking sensitivity" onClose={close}>
      <p className="mb-4">The material, page identity, or sensitivity policy changed after your explicit tracking choice. Review the current evidence before keeping it tracked.</p>
      {pendingTracking.map(([key, decision]) => <section key={key} className="mb-4 rounded border p-3">
        <SourcePath value={bundleNodeKeySourceGraphPath(parseBundleNodeKey(key))} /><p className="text-sm">{decision.invalidated ?? review.trackingTargets[key]?.sensitivityReasons?.join(' ') ?? 'This page is sensitive under the current policy.'}</p>
        <div className="mt-3 flex gap-3"><button disabled={busy} onClick={() => void mutate('tracking', { nodeKeys: [key], track: false })}>Leave untracked</button>
          {review.trackingTargets[key] && <button disabled={busy} onClick={() => void mutate('tracking', { nodeKeys: [key], track: true, confirmSensitive: true })}>{decision.identityChanged ? 'Confirm tracking current page' : 'Confirm tracking sensitive page'}</button>}</div>
      </section>)}
      {pendingTracking.length === 0 && <p>All tracking choices reviewed.</p>}
    </Modal>
    <Modal isOpen={dialog === 'refresh'} title="Update sources for this change?" onClose={close} footer={<div className="flex justify-end gap-3"><button disabled={busy} onClick={close}>Cancel</button><button disabled={busy} onClick={refresh}>Update sources and apply change</button></div>}>
      <p>Newer source material is available. Applying this traversal change will update the capture being reviewed. Cancel keeps the previous capture and settings.</p>
    </Modal>
    {comparison && <SourcingComponentContentComparison evidence={comparison} request={request} onClose={() => onIdentityComparison(undefined)} />}
  </>;
}
