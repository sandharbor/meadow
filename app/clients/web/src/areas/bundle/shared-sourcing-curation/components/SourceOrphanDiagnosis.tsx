/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceOrphanExplanation } from '../../../../../../../contracts/types/sourcing.js';
import { FilePill } from '../../../../shared/components/FilePill.js';

/** Explains why a removed page's saved configuration is no longer reachable. */
export function SourceOrphanDiagnosis({ orphan }: { orphan: SourceOrphanExplanation }) {
  const diagnosis = orphan.diagnosis;
  const sentence = diagnosis?.kind === 'missing-file'
    ? diagnosis.from ? <><FilePill path={diagnosis.from} /> links to <FilePill path={diagnosis.to} />, but that file does not exist in the filesystem.</>
      : <><FilePill path={diagnosis.to} /> does not exist in the filesystem.</>
    : diagnosis?.kind === 'removed-link' ? <><FilePill path={diagnosis.from} /> no longer links to <FilePill path={diagnosis.to} />.</>
      : diagnosis?.kind === 'outside-graph' ? <><FilePill path={diagnosis.to} /> exists in the filesystem, but is not reachable in this snapshot’s working graph.</>
        : <>{orphan.reason}</>;
  return <div data-testid="source-orphan-diagnosis" className="space-y-1">
    <p className="leading-relaxed [overflow-wrap:anywhere]">{sentence}</p>
    <p className="text-neutral-600">{orphan.removalBlockedReason ?? 'Accepting removes this page’s saved configuration. The source files are untouched.'}</p>
  </div>;
}
