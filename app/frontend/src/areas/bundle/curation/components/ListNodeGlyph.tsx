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

import React from 'react';
import type { DisplayNode } from '../types/displayGraph';
import BundleNodeGlyph from './BundleNodeGlyph';

const nodeKindLabel = (node: DisplayNode): string => {
  if (node.bundleNodeKind === 'collection') return 'Bundle home';
  if (node.bundleNodeKind === 'folder') return 'Folder';
  return 'File';
};

const ListNodeGlyph: React.FC<{
  node: DisplayNode;
  onMouseEnter?: React.MouseEventHandler<SVGSVGElement>;
  onMouseLeave?: React.MouseEventHandler<SVGSVGElement>;
}> = ({ node, onMouseEnter, onMouseLeave }) => (
  <svg
    viewBox="-8 -8 16 16"
    width="32"
    height="32"
    className="block flex-shrink-0 overflow-visible"
    role="img"
    aria-label={nodeKindLabel(node)}
    data-testid="list-node-glyph"
    data-node-kind={node.bundleNodeKind}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
  >
    <BundleNodeGlyph
      isSelected={node.isSelected}
      isFrontierNode={node.isFrontierNode}
      isFrontierImageExtension={node.isFrontierImageExtension}
      tracked={node.tracked}
      fileType={node.fileType}
      bundleNodeKind={node.bundleNodeKind}
      highlights={node.highlights}
      showLabel={false}
      label=""
      showImageIndicator={false}
    />
  </svg>
);

export default ListNodeGlyph;
