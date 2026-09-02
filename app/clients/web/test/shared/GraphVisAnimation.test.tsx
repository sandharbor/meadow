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

import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Graph } from '../../../../contracts/types/graph';
import type { DisplayGraph } from '../../src/areas/bundle/curation/types/displayGraph';

vi.mock('../../src/areas/bundle/curation/components/DepthCallout', () => ({
  default: () => null,
  useDepthCalloutDismissal: () => ({ calloutDismissed: true, handleDismissCallout: vi.fn() }),
  useHasFrontierOutlinks: () => false,
}));

import GraphVis from '../../src/areas/bundle/curation/components/GraphVis';

const graph = {
  getAllNodes: () => [],
  getAllEdges: () => [],
} as unknown as Graph;

function displayGraph(bundleNodeKeys: string[]): DisplayGraph {
  return {
    allDisplayNodes: bundleNodeKeys.map((bundleNodeKey, index) => ({
      bundleNodeKey,
      bundleNodeName: bundleNodeKey,
      bundleNodeKind: 'file',
      distance: index,
      isVisible: false,
      showTitle: false,
    })),
    getDisplayNode: () => undefined,
  } as unknown as DisplayGraph;
}

const props = {
  graph,
  filters: [],
  selectedNodeKeys: new Set<string>(),
  onSelectedNodeKeysChange: vi.fn(),
  bundleSlug: 'test-bundle',
  isFolderBasedBundle: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GraphVis layout animation', () => {
  it('animates a changed layout once without restarting from its own position updates', () => {
    const frames: Array<(timestamp: number) => void> = [];
    const requestFrame = vi.fn((callback: (timestamp: number) => void) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    const view = render(<GraphVis {...props} displayGraph={displayGraph(['one'])} />);
    expect(requestFrame).not.toHaveBeenCalled();

    view.rerender(<GraphVis {...props} displayGraph={displayGraph(['one', 'two'])} />);
    for (let frame = 0; frame < 10; frame++) {
      const callback = frames.shift();
      expect(callback).toBeDefined();
      act(() => callback?.(frame * 16));
    }

    expect(requestFrame).toHaveBeenCalledTimes(10);
    expect(frames).toHaveLength(0);
  });
});
