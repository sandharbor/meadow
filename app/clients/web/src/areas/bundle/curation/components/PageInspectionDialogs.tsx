/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, { useState } from 'react';
import { Graph, IBundleNode } from '../../../../../../../contracts/types/graph';
import TraversalPathDetailsModal from '../../../../shared/components/TraversalPathDetailsModal.js';
import BundleNodeLinksModal from './BundleNodeLinksModal';
import { useLinkedSurface } from '../../../../shared/places/placeContext.js';

/**
 * The dialogs that inspect one page: how traversal reached it and what it
 * links to. Both are App Place surfaces, so links can open them directly.
 */
export function usePageInspectionDialogs(options: {
  graph: Graph;
  selectedNodeKeys: Set<EncodedBundleNodeKey>;
  onSelectedNodeKeysChange: (pages: Set<EncodedBundleNodeKey>) => void;
  isEffectivelySensitive: (page: IBundleNode) => boolean;
}): { showTraversalDetails(bundleNodeKey: EncodedBundleNodeKey): void; showLinks(bundleNodeKey: EncodedBundleNodeKey): void; dialogs: React.ReactNode } {
  const { graph, selectedNodeKeys, onSelectedNodeKeysChange, isEffectivelySensitive } = options;
  const [traversalNodeKey, setTraversalNodeKey] = useState<EncodedBundleNodeKey | null>(null);
  const [linksNodeKey, setLinksNodeKey] = useState<EncodedBundleNodeKey | null>(null);
  const pageForPlace = (bundleNodeKey: EncodedBundleNodeKey): true | string => graph.getNode(bundleNodeKey) ? true : `the page ${bundleNodeKey} is not in this bundle`;

  useLinkedSurface('traversal-details', {
    open: traversalNodeKey !== null,
    parameters: traversalNodeKey ? { node: traversalNodeKey } : undefined,
  }, {
    open: parameters => {
      const found = pageForPlace(encodedBundleNodeKey(parameters.node));
      if (found !== true) return found;
      if (!graph.getNode(encodedBundleNodeKey(parameters.node))?.path?.length) return 'the page has no traversal path';
      setTraversalNodeKey(encodedBundleNodeKey(parameters.node));
      return true;
    },
    close: () => setTraversalNodeKey(null),
  });
  useLinkedSurface('node-links', {
    open: linksNodeKey !== null,
    parameters: linksNodeKey ? { node: linksNodeKey } : undefined,
  }, {
    open: parameters => {
      const found = pageForPlace(encodedBundleNodeKey(parameters.node));
      if (found !== true) return found;
      setLinksNodeKey(encodedBundleNodeKey(parameters.node));
      return true;
    },
    close: () => setLinksNodeKey(null),
  });

  const traversalNode = traversalNodeKey ? graph.getNode(traversalNodeKey) : undefined;
  const changeSelection = (bundleNodeKey: EncodedBundleNodeKey, selected: boolean) => {
    const next = new Set(selectedNodeKeys);
    if (selected) next.add(bundleNodeKey);
    else next.delete(bundleNodeKey);
    onSelectedNodeKeysChange(next);
  };

  return {
    showTraversalDetails: setTraversalNodeKey,
    showLinks: setLinksNodeKey,
    dialogs: <>
      {traversalNode && (
        <TraversalPathDetailsModal
          isOpen
          onClose={() => setTraversalNodeKey(null)}
          selectedNode={traversalNode}
          graph={graph}
        />
      )}
      {linksNodeKey && (
        <BundleNodeLinksModal
          isOpen
          onClose={() => setLinksNodeKey(null)}
          initialBundleNodeKey={linksNodeKey}
          graph={graph}
          onSelectNode={bundleNodeKey => changeSelection(bundleNodeKey, true)}
          onDeselectNode={bundleNodeKey => changeSelection(bundleNodeKey, false)}
          selectedNodeKeys={selectedNodeKeys}
          isEffectivelySensitive={isEffectivelySensitive}
        />
      )}
    </>,
  };
}

import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';

import { encodedBundleNodeKey } from '../../../../../../../shared_code/utils/bundleNodeKey.js';
