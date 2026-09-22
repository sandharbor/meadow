/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useSourcePath } from '../../../../shared/components/SourceNames.js';
import type { Graph } from '../../../../../../../contracts/types/graph.js';
import { traversalLinkType, type TraversalLinkType } from '../../../../shared/utils/traversalLinkType.js';

const connectors: Record<TraversalLinkType, { arrow: string; label: string }> = {
  start: { arrow: '', label: 'start' },
  outlink: { arrow: '→', label: 'outlink' },
  inlink: { arrow: '←', label: 'inlink' },
  bidirectional: { arrow: '↔', label: 'bidirectional' },
  directoryContainment: { arrow: '→', label: 'contained in folder' },
  collectionMembership: { arrow: '→', label: 'starting selection' },
  unknown: { arrow: '·', label: 'direction unavailable' },
};

function RouteConnector({ linkType }: { linkType: TraversalLinkType }) {
  const { arrow, label } = connectors[linkType];
  return <span role="img" aria-label={label} className="mx-1 text-sm text-neutral-500">{arrow}</span>;
}

export function FilePill({ path }: { path: string }) {
  const label = useSourcePath(path);
  const qualified = label !== path;
  return <span title={label} data-testid="source-file-pill" className="inline-flex max-w-full items-baseline gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 align-middle text-neutral-700">
    <span aria-hidden="true" className="shrink-0 text-neutral-400">▤</span><span className="[overflow-wrap:anywhere]">{qualified ? label : path.split('/').pop()}</span>
  </span>;
}

export function FileRoute({ paths, graph, onDetails }: { paths: string[]; graph?: Graph; onDetails?: () => void }) {
  return <div className="mt-2 flex flex-wrap items-center gap-1">{paths.map((path, index) => <span key={`${index}:${path}`} className="contents">{index > 0 && <RouteConnector linkType={graph ? traversalLinkType(graph, paths[index - 1], path) : 'unknown'} />}<FilePill path={path} /></span>)}
    {onDetails && <button type="button" className="ml-2 text-xs text-main-700 underline hover:text-main-900" aria-label={`Traversal details for ${paths.at(-1)}`} onClick={onDetails}>Details</button>}
  </div>;
}
