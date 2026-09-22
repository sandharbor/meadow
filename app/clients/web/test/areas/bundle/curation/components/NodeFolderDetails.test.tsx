/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IBundleNode } from '../../../../../../../contracts/types/IBundleNode.js';
import { NodeFolderDetails } from '../../../../../src/areas/bundle/curation/components/NodeFolderDetails.js';

const sources = [
  { id: 'source000001', name: 'notes', directory: '/private/notes' },
  { id: 'source000002', name: 'research', directory: '/private/research' },
];
const page: IBundleNode = {
  bundleNodeKey: '_mw_sources/source000001/Same/Inside.md' as IBundleNode['bundleNodeKey'],
  bundleNodeKind: 'file', bundleNodeName: 'Inside', fileType: 'md', sourceId: sources[0].id,
  sourceGraphSubdirectory: 'Same', label: 'Inside', depth: 1, remaining_depth: 0,
  getIdent: () => 'Inside',
};

describe('selected-node folder', () => {
  it.each([
    [0, '', '/'], [1, '', '/'], [1, 'Same/Nested', 'Same/Nested'],
    [2, '', 'notes://'], [2, 'Same/Nested', 'notes://Same/Nested'],
    [2, '研究 and notes', 'notes://研究 and notes'],
  ])('shows a readable location with %i sources and folder %s', (sourceCount, directory, expected) => {
    render(<NodeFolderDetails node={{ ...page, sourceGraphSubdirectory: directory }} sources={sources.slice(0, sourceCount)} />);
    expect(screen.getByRole('term')).toHaveTextContent('Folder');
    expect(screen.getByRole('definition')).toHaveTextContent(expected);
    expect(screen.queryByText(/private|_mw_sources/)).not.toBeInTheDocument();
  });

  it('uses the owning source and its current canonical name', () => {
    render(<NodeFolderDetails node={{ ...page, sourceId: sources[1].id }} sources={[sources[0], { ...sources[1], name: 'papers' }]} />);
    expect(screen.getByRole('definition')).toHaveTextContent('papers://Same');
  });
});
