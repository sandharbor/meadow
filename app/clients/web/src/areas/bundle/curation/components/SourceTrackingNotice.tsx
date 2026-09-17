/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SnapshotTrackingOutcome } from '../../../../../../../contracts/types/curationTracking';
import Modal from '../../../../shared/components/Modal';

export default function SourceTrackingNotice({ outcome, onClose, onShowPages, canShowPages }: {
  outcome: SnapshotTrackingOutcome;
  onClose: () => void;
  onShowPages: () => void;
  canShowPages: boolean;
}) {
  const sensitiveCount = outcome.sensitiveSkipped.length;
  const otherCount = outcome.otherSkipped.length;
  if (!sensitiveCount && !otherCount && !outcome.error) return null;
  return <Modal isOpen manageFocus onClose={onClose} title="Tracking added pages" className="w-full max-w-lg" footer={
    <div className="flex justify-end gap-3">
      <button className="rounded border border-neutral-300 px-4 py-2" onClick={onClose}>Okay</button>
      <button className="rounded bg-btn-confirm-normal px-4 py-2 text-btn-confirm-text disabled:opacity-50" disabled={!canShowPages} onClick={onShowPages}>Show them</button>
    </div>
  }>
    <div className="space-y-3 text-sm text-neutral-700">
      {outcome.error ? <p role="alert">Sources were accepted, but automatic tracking could not finish: {outcome.error}</p> : <>
        {sensitiveCount > 0 && <p>Bulk tracking did not track {sensitiveCount} sensitive {sensitiveCount === 1 ? 'page' : 'pages'}.</p>}
        {otherCount > 0 && <p>{otherCount} other {otherCount === 1 ? 'page could' : 'pages could'} not be tracked.</p>}
        <p>These pages are in the accepted sources and remain untracked.</p>
      </>}
    </div>
  </Modal>;
}
