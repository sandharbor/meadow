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

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import BundleNodeContextMenu from '../../../../../src/areas/bundle/curation/components/BundleNodeContextMenu';
import { Graph } from '../../../../../../../shared_code/types/graph';
import type { IBundleNode } from '../../../../../../../shared_code/types/IBundleNode';
import type { BundleNodeId, BundleNodeKey } from '../../../../../../../shared_code/types/bundleNodeConfig';

const commonNode = {
  label: 'A',
  depth: 0,
  remaining_depth: 0,
  getIdent: () => 'node',
};

const markdownNode: IBundleNode = {
  ...commonNode,
  bundleNodeKey: 'note' as BundleNodeKey,
  bundleNodeName: 'Note',
  bundleNodeKind: 'file',
  sourceGraphSubdirectory: '',
  fileType: 'md',
};

const imageNode: IBundleNode = {
  ...commonNode,
  bundleNodeKey: 'image' as BundleNodeKey,
  bundleNodeName: 'Image',
  bundleNodeKind: 'file',
  sourceGraphSubdirectory: '',
  fileType: 'png',
};

const folderNode: IBundleNode = {
  ...commonNode,
  bundleNodeKey: 'folder' as BundleNodeKey,
  bundleNodeName: 'Folder',
  bundleNodeKind: 'folder',
  sourceGraphSubdirectory: 'Folder',
};

const bundleHomeNode: IBundleNode = {
  ...commonNode,
  bundleNodeKey: 'bundle-home' as BundleNodeKey,
  bundleNodeName: 'Bundle home',
  bundleNodeKind: 'collection',
  memberBundleNodeIds: ['folder-id' as BundleNodeId],
};

const renderMenu = (page: IBundleNode) => render(
  <MemoryRouter>
    <BundleNodeContextMenu
      page={page}
      graph={new Graph()}
      position={{ x: 0, y: 0 }}
      onClose={vi.fn()}
      onTrackPage={vi.fn()}
      onBlacklistPage={vi.fn()}
      onPreviewPage={vi.fn()}
      onSelectedNodeKeysChange={vi.fn()}
      onMarkSensitive={vi.fn()}
      obsidianInfo={null}
    />
  </MemoryRouter>
);

describe('BundleNodeContextMenu file-specific actions', () => {
  it('offers sensitivity and bundle lookup for Markdown pages', () => {
    renderMenu(markdownNode);

    expect(screen.getByRole('button', { name: 'Mark Sensitive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find in Bundles' })).toBeInTheDocument();
  });

  it('offers bundle lookup but not sensitivity for images', () => {
    renderMenu(imageNode);

    expect(screen.queryByRole('button', { name: 'Mark Sensitive' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find in Bundles' })).toBeInTheDocument();
  });

  it.each([
    ['folders', folderNode],
    ['bundle homes', bundleHomeNode],
  ])('offers neither sensitivity nor bundle lookup for %s', (_label, node) => {
    renderMenu(node);

    expect(screen.queryByRole('button', { name: 'Mark Sensitive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Find in Bundles' })).not.toBeInTheDocument();
  });
});
