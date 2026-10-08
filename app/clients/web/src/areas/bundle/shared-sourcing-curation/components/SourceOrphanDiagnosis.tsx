/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { ReactNode } from 'react';
import type { SourceOrphanExplanation } from '../../../../../../../contracts/types/sourcing.js';
import { FilePill } from '../../../../shared/components/FilePill.js';

/** The file-level reason a page's saved configuration is no longer reachable; `pill` renders each named file. */
export function SourceOrphanSentence({ orphan, pill = path => <FilePill path={path} /> }: { orphan: SourceOrphanExplanation; pill?: (path: string) => ReactNode }) {
  const diagnosis = orphan.diagnosis;
  const sentence = diagnosis?.kind === 'missing-file'
    ? diagnosis.from ? <>{pill(diagnosis.from)} links to {pill(diagnosis.to)}, but that file does not exist in the filesystem.</>
      : <>{pill(diagnosis.to)} does not exist in the filesystem.</>
    : diagnosis?.kind === 'removed-link' ? <>{pill(diagnosis.from)} no longer links to {pill(diagnosis.to)}.</>
      : diagnosis?.kind === 'outside-graph' ? <>{pill(diagnosis.to)} exists in the filesystem, but is not reachable in this snapshot’s working graph.</>
        : <>{orphan.reason}</>;
  return <p className="leading-relaxed [overflow-wrap:anywhere]">{sentence}</p>;
}

/** Explains why a removed page's saved configuration is no longer reachable. The consequence of acceptance is stated once for the whole list; only a blocked removal adds its own. */
export function SourceOrphanDiagnosis({ orphan }: { orphan: SourceOrphanExplanation }) {
  return <div data-testid="source-orphan-diagnosis" className="space-y-1">
    <SourceOrphanSentence orphan={orphan} />
    {orphan.removalBlockedReason && <p className="text-amber-800">{orphan.removalBlockedReason}</p>}
  </div>;
}
