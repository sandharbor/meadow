/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleSource } from '../../../../../../../contracts/types/bundleConfig.js';
import type { IBundleNode } from '../../../../../../../contracts/types/IBundleNode.js';
import { sourceLocationLabel } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';

export function NodeFolderDetails({ node, sources }: { node: IBundleNode; sources: readonly BundleSource[] }) {
  if (node.bundleNodeKind === 'collection') return null;
  const source = sources.length > 1 ? sources.find(source => source.id === node.sourceId) : undefined;
  const folder = source ? sourceLocationLabel(source.name, node.sourceGraphSubdirectory) : node.sourceGraphSubdirectory || '/';
  return <dl data-testid="selected-node-folder" className="text-xs">
    <dt className="mb-1 font-semibold text-neutral-700">Folder</dt>
    <dd className="text-neutral-600 [overflow-wrap:anywhere]">{folder}</dd>
  </dl>;
}
