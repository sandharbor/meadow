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

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import BundleNodeGlyph from '../../../../../src/areas/bundle/shared-sourcing-curation/components/BundleNodeGlyph';
import type { BundleNodeKind } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig';
import type { FileType } from '../../../../../../../contracts/types/shared/bundle-graph/FileType';

const highlight = {
  color: '#14b8a6',
  isDashed: false,
  filterId: 'test-filter',
  filterName: 'Test Filter',
};

const renderGlyph = (bundleNodeKind: BundleNodeKind, fileType: FileType = 'md') => render(
  <svg>
    <BundleNodeGlyph
      isSelected={false}
      isFrontierNode={false}
      isFrontierImageExtension={false}
      tracked
      fileType={fileType}
      bundleNodeKind={bundleNodeKind}
      highlights={[highlight]}
      showLabel={false}
      label=""
    />
  </svg>
);

describe('BundleNodeGlyph shapes', () => {
  it.each([
    ['file', 'file'],
    ['folder', 'folder'],
    ['collection', 'collection'],
  ] as const)('uses matching core and filter-band shapes for %s nodes', (bundleNodeKind, expectedShape) => {
    const { container } = renderGlyph(bundleNodeKind);

    expect(container.querySelector(`[data-node-shape="${expectedShape}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-highlight-shape="${expectedShape}"]`)).not.toBeNull();
  });
});

describe('BundleNodeGlyph indicators', () => {
  it('marks a PDF with a document, not an image', () => {
    const { container } = renderGlyph('file', 'pdf');

    expect(container.querySelector('[data-node-indicator="pdf"]')).not.toBeNull();
    expect(container.querySelectorAll('g')).toHaveLength(1);
  });
});
