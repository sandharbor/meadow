/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Graph } from '../../../../../../../contracts/types/graph.js';
import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';
import { sourceReviewAppearance, sourceRemovalReasons } from '../../../../shared/utils/sourceReviewAppearance.js';
import { bundleNodeKeySourceGraphPath } from '../../../../../../../shared_code/utils/bundleNodeKey.js';
import { useSourcePath } from '../../../../shared/components/SourceNames.js';

/** A page named in a source-change explanation, outlined in its change color; clicking selects it. */
export function SourceChangePagePill({ bundleNodeKey, graph, onSelect }: { bundleNodeKey: EncodedBundleNodeKey; graph: Graph; onSelect: (key: EncodedBundleNodeKey) => void }) {
  const page = graph.getNode(bundleNodeKey);
  const review = page?.sourceReview;
  const appearance = review && review.kind !== 'unchanged' && review.kind !== 'frontier' ? sourceReviewAppearance[review.kind] : null;
  const path = useSourcePath(review?.previousPath ?? review?.proposedPath ?? bundleNodeKeySourceGraphPath(bundleNodeKey));
  const change = appearance && [appearance.label, review?.removalReason && sourceRemovalReasons[review.removalReason].label].filter(Boolean).join(' · ');
  const name = page?.bundleNodeName ?? path.split('/').pop() ?? bundleNodeKey;
  return <button type="button" data-testid="source-change-page-pill" data-bundle-node-key={bundleNodeKey} data-source-path={path} onClick={() => onSelect(bundleNodeKey)}
    title={[path, change, 'Click to select'].filter(Boolean).join('\n')}
    className="inline-flex max-w-full items-baseline gap-1 rounded-md border bg-white px-1.5 py-0.5 align-middle font-medium text-neutral-800 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
    style={{ borderColor: appearance?.color ?? '#d4d4d4' }}>
    <span className="[overflow-wrap:anywhere]">{name}</span>
  </button>;
}
