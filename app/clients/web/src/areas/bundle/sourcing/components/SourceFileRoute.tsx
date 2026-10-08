/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { FilePill } from '../../../../shared/components/FilePill.js';
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

export function FileRoute({ paths, graph, onDetails }: { paths: EncodedBundleNodeKey[]; graph?: Graph; onDetails?: () => void }) {
  const last = paths.at(-1);
  const detailsLabel = last && (parseBundleNodeKey(last).kind === 'collection' ? 'Bundle home' : bundleNodeKeySourceGraphPath(last));
  return <div className="mt-2 flex flex-wrap items-center gap-1">{paths.map((path, index) => <span key={`${index}:${path}`} className="contents">{index > 0 && <RouteConnector linkType={graph ? traversalLinkType(graph, paths[index - 1], path) : 'unknown'} />}<FilePill path={parseBundleNodeKey(path).kind === 'collection' ? 'Bundle home' : bundleNodeKeySourceGraphPath(path)} /></span>)}
    {onDetails && <button type="button" className="ml-2 text-xs text-main-700 underline hover:text-main-900" aria-label={`Traversal details for ${detailsLabel}`} onClick={onDetails}>Details</button>}
  </div>;
}

import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';

import { bundleNodeKeySourceGraphPath, parseBundleNodeKey } from '../../../../../../../shared_code/utils/bundleNodeKey.js';
