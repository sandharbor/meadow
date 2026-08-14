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

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FolderBundleFields, {
  type FolderBundlePreflight,
} from '../../../../src/areas/bundles/components/FolderBundleFields';

const callbacks = () => ({
  onBundleNameChange: vi.fn(),
  onAddFolders: vi.fn(),
  onMoveFolder: vi.fn(),
  onRemoveFolder: vi.fn(),
  onConfirmHighImpactChange: vi.fn(),
});

describe('FolderBundleFields', () => {
  it('exposes ordered selection controls with unambiguous accessible names', () => {
    const handlers = callbacks();
    render(
      <FolderBundleFields
        bundleName="Research"
        selectedFolders={['/vault/Alpha', '/vault/Beta']}
        preflight={null}
        confirmHighImpact={false}
        {...handlers}
      />
    );

    const list = screen.getByRole('list', { name: 'Selected folders in bundle-home order' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Move /vault/Beta earlier' }));
    expect(handlers.onMoveFolder).toHaveBeenCalledWith(1, -1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove /vault/Alpha' }));
    expect(handlers.onRemoveFolder).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole('button', { name: 'Add folders' }));
    expect(handlers.onAddFolders).toHaveBeenCalledOnce();
  });

  it('renders exact preflight evidence and requires explicit high-impact confirmation', () => {
    const handlers = callbacks();
    const preflight: FolderBundlePreflight = {
      fingerprint: 'fingerprint',
      plan: {
        sourceDirectory: '/vault',
        normalizedSelectedFolders: ['Alpha'],
        folderBundleNodeIds: ['aaaaaaaaaaaa'],
        entryBundleNodeId: 'aaaaaaaaaaaa',
        defaultOutlinksDepth: 1,
        defaultInlinksDepth: 0,
      },
      duplicateSelections: [],
      overlaps: [],
      supportedSeedFileCount: 21,
      requiredRawFolderNodeCount: 4,
      skippedCounts: { hidden: 1 },
      skippedPaths: [{ path: 'Alpha/.hidden.md', reason: 'hidden' }],
      skippedPathCount: 1,
      predictedRawNodeCount: 44,
      predictedTypedEdgeCount: 58,
      sensitiveNodeCount: 0,
      preferredRouteCollisions: [],
      highImpactWarning: true,
    };
    render(
      <FolderBundleFields
        bundleName="Research"
        selectedFolders={['/vault/Alpha']}
        preflight={preflight}
        confirmHighImpact={false}
        {...handlers}
      />
    );

    const prediction = screen.getByRole('region', { name: 'Folder bundle prediction' });
    expect(within(prediction).getByText('21')).toBeInTheDocument();
    expect(within(prediction).getByText('58')).toBeInTheDocument();
    fireEvent.click(within(prediction).getByText('1 skipped paths'));
    expect(within(prediction).getByText('Alpha/.hidden.md — hidden')).toBeInTheDocument();
    fireEvent.click(within(prediction).getByRole('checkbox'));
    expect(handlers.onConfirmHighImpactChange).toHaveBeenCalledWith(true);
  });
});
