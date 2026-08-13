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
import SiteNodeGlyph from '../../../../../src/areas/site/curation/components/SiteNodeGlyph';
import type { SiteNodeKind } from '../../../../../../shared_code/types/siteNodeConfig';

const highlight = {
  color: '#14b8a6',
  isDashed: false,
  filterId: 'test-filter',
  filterName: 'Test Filter',
};

const renderGlyph = (siteNodeKind: SiteNodeKind) => render(
  <svg>
    <SiteNodeGlyph
      isSelected={false}
      isFrontierNode={false}
      isFrontierImageExtension={false}
      tracked
      fileType="md"
      siteNodeKind={siteNodeKind}
      highlights={[highlight]}
      showLabel={false}
      label=""
    />
  </svg>
);

describe('SiteNodeGlyph shapes', () => {
  it.each([
    ['file', 'file'],
    ['folder', 'folder'],
    ['collection', 'collection'],
  ] as const)('uses matching core and filter-band shapes for %s nodes', (siteNodeKind, expectedShape) => {
    const { container } = renderGlyph(siteNodeKind);

    expect(container.querySelector(`[data-node-shape="${expectedShape}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-highlight-shape="${expectedShape}"]`)).not.toBeNull();
  });
});
