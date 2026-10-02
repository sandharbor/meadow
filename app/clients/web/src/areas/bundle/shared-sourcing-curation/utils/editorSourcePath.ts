/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { IBundleNode } from '../../../../../../../contracts/types/graph.js';

/** Thumbnails and hover previews use the same captured side as the comparison node. */
export function editorSourcePath(bundleSlug: string, node: IBundleNode, filename: string, live: boolean): string {
  const review = node.sourceReview;
  if (review) {
    const path = review.proposedPath ?? review.previousPath;
    const snapshotId = review.proposedPath ? review.afterSnapshotId : review.beforeSnapshotId;
    return `bundles/${encodeURIComponent(bundleSlug)}/sourcing/content/${encodeURIComponent(path ?? filename)}?snapshotId=${snapshotId}`;
  }
  return `bundles/${encodeURIComponent(bundleSlug)}/generation/source-file/${encodeURIComponent(filename)}${live ? '?sourceView=live' : ''}`;
}
