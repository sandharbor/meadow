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
import type { IEdge } from '../../../../../../../shared_code/types/graph';
import {
  calculateGraphLayout,
  type GraphLayoutNode,
} from '../../../../../src/areas/bundle/curation/utils/graphLayout';

const node = (
  bundleNodeKey: string,
  bundleNodeKind: GraphLayoutNode['bundleNodeKind'],
  distance: number | undefined,
  bundleNodeName = bundleNodeKey,
): GraphLayoutNode => ({
  bundleNodeKey,
  bundleNodeKind,
  bundleNodeName,
  distance,
  isVisible: true,
});

const edge = (
  source: string,
  target: string,
  bundleEdgeKind: IEdge['bundleEdgeKind'],
): IEdge => ({ source, target, bundleEdgeKind });

const position = (layout: ReturnType<typeof calculateGraphLayout>, key: string) => {
  const result = layout.positions.get(key);
  expect(result, `expected a position for ${key}`).toBeDefined();
  return result!;
};

describe('calculateGraphLayout', () => {
  it('preserves the depth-row layout for single-file bundles', () => {
    const layout = calculateGraphLayout([
      node('start', 'file', 0),
      node('linked', 'file', 1),
    ], []);

    expect(layout.isFolderAware).toBe(false);
    expect(layout.guides).toEqual([]);
    expect(position(layout, 'start').y).toBe(20);
    expect(position(layout, 'linked').y).toBe(180);
  });

  it('places a nested folder tree above linked-page depth rows', () => {
    const layout = calculateGraphLayout([
      node('root', 'folder', 0),
      node('intro', 'file', 0),
      node('overview', 'file', 0),
      node('nested', 'folder', 0),
      // Structural membership wins even when the file carries a semantic depth.
      node('nested-page', 'file', 2),
      node('linked-one', 'file', 1),
      node('linked-two', 'file', 2),
    ], [
      edge('root', 'intro', 'directoryContainment'),
      edge('root', 'overview', 'directoryContainment'),
      edge('root', 'nested', 'directoryContainment'),
      edge('nested', 'nested-page', 'directoryContainment'),
      edge('overview', 'linked-one', 'semanticLink'),
      edge('linked-one', 'linked-two', 'semanticLink'),
    ]);

    const root = position(layout, 'root');
    const intro = position(layout, 'intro');
    const overview = position(layout, 'overview');
    const nested = position(layout, 'nested');
    const nestedPage = position(layout, 'nested-page');
    const linkedOne = position(layout, 'linked-one');
    const linkedTwo = position(layout, 'linked-two');

    expect(layout.isFolderAware).toBe(true);
    expect(root.y).toBeLessThan(intro.y);
    expect(intro.y).toBe(overview.y);
    expect(nested.y).toBeGreaterThan(overview.y);
    expect(nestedPage.y).toBeGreaterThan(nested.y);
    expect(nestedPage.y).toBeLessThan(linkedOne.y);
    expect(linkedOne.y).toBeLessThan(linkedTwo.y);
    expect(intro.x).toBeGreaterThan(root.x);
    expect(nested.x).toBeGreaterThan(root.x);
    expect(nestedPage.x).toBeGreaterThan(nested.x);
    expect(layout.guides.map(guide => guide.label)).toEqual([
      'Selected folders',
      'Linked pages',
      'Depth 1',
      'Depth 2',
    ]);
  });

  it('keeps collection member folders in configured edge order', () => {
    const layout = calculateGraphLayout([
      node('collection', 'collection', 0),
      node('folder-b', 'folder', 0),
      node('page-b', 'file', 0),
      node('folder-a', 'folder', 0),
      node('page-a', 'file', 0),
    ], [
      edge('collection', 'folder-b', 'collectionMembership'),
      edge('collection', 'folder-a', 'collectionMembership'),
      edge('folder-b', 'page-b', 'directoryContainment'),
      edge('folder-a', 'page-a', 'directoryContainment'),
    ]);

    expect(position(layout, 'collection').y).toBeLessThan(position(layout, 'folder-b').y);
    expect(position(layout, 'folder-b').y).toBeLessThan(position(layout, 'page-b').y);
    expect(position(layout, 'page-b').y).toBeLessThan(position(layout, 'folder-a').y);
    expect(position(layout, 'folder-a').y).toBeLessThan(position(layout, 'page-a').y);
  });

  it('orders linked pages near their already-positioned predecessors', () => {
    const layout = calculateGraphLayout([
      node('root', 'folder', 0),
      node('left-seed', 'file', 0),
      node('right-seed', 'file', 0),
      // Alphabetical order conflicts with predecessor order on purpose.
      node('right-linked', 'file', 1, 'Alpha'),
      node('left-linked', 'file', 1, 'Zulu'),
    ], [
      edge('root', 'left-seed', 'directoryContainment'),
      edge('root', 'right-seed', 'directoryContainment'),
      edge('left-seed', 'left-linked', 'semanticLink'),
      edge('right-seed', 'right-linked', 'semanticLink'),
    ]);

    expect(position(layout, 'left-seed').x).toBeLessThan(position(layout, 'right-seed').x);
    expect(position(layout, 'left-linked').x).toBeLessThan(position(layout, 'right-linked').x);
  });

  it('wraps a crowded semantic depth into one labeled multi-row band', () => {
    const linkedPages = Array.from({ length: 70 }, (_, index) => (
      node(`linked-${index}`, 'file', 1)
    ));
    const layout = calculateGraphLayout([
      node('root', 'folder', 0),
      node('contained', 'file', 0),
      ...linkedPages,
    ], [
      edge('root', 'contained', 'directoryContainment'),
      ...linkedPages.map(linked => edge('contained', linked.bundleNodeKey, 'semanticLink')),
    ]);

    const linkedPositions = linkedPages.map(linked => position(layout, linked.bundleNodeKey));
    const physicalRows = new Set(linkedPositions.map(linkedPosition => linkedPosition.y));
    const depthGuides = layout.guides.filter(guide => guide.label === 'Depth 1');

    expect(physicalRows.size).toBeGreaterThan(1);
    expect(depthGuides).toHaveLength(1);
    for (const y of physicalRows) {
      const rowXValues = linkedPositions
        .filter(linkedPosition => linkedPosition.y === y)
        .map(linkedPosition => linkedPosition.x)
        .sort((left, right) => left - right);
      for (let index = 1; index < rowXValues.length; index += 1) {
        expect(rowXValues[index] - rowXValues[index - 1]).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('labels unconnected depth-zero pages separately from the folder tree', () => {
    const layout = calculateGraphLayout([
      node('root', 'folder', 0),
      node('contained', 'file', 0),
      node('extra-root', 'file', 0),
      node('unknown', 'file', undefined),
    ], [
      edge('root', 'contained', 'directoryContainment'),
    ]);

    expect(position(layout, 'contained').y).toBeLessThan(position(layout, 'extra-root').y);
    expect(position(layout, 'extra-root').y).toBeLessThan(position(layout, 'unknown').y);
    expect(layout.guides.map(guide => guide.label)).toContain('Additional roots');
    expect(layout.guides.map(guide => guide.label)).toContain('Other');
  });
});
