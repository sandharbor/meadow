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

import { describe, it, expect } from 'vitest';
import { splitTitleBySearch, computeLabelPlacements } from '../graphSearchLabels';

describe('splitTitleBySearch', () => {
  it('returns full title when search text is empty', () => {
    const result = splitTitleBySearch('my-page-title', '');
    expect(result).toEqual([{ text: 'my-page-title', isHighlighted: false }]);
  });

  it('returns full title when search text is too short (< 2 chars)', () => {
    const result = splitTitleBySearch('my-page-title', 'a');
    expect(result).toEqual([{ text: 'my-page-title', isHighlighted: false }]);
  });

  it('highlights a matching substring in the middle', () => {
    const result = splitTitleBySearch('my-awesome-page', 'awesome');
    expect(result).toEqual([
      { text: 'my-', isHighlighted: false },
      { text: 'awesome', isHighlighted: true },
      { text: '-page', isHighlighted: false },
    ]);
  });

  it('handles case-insensitive matching', () => {
    const result = splitTitleBySearch('My-Awesome-Page', 'awesome');
    expect(result).toEqual([
      { text: 'My-', isHighlighted: false },
      { text: 'Awesome', isHighlighted: true },
      { text: '-Page', isHighlighted: false },
    ]);
  });

  it('highlights match at the start', () => {
    const result = splitTitleBySearch('awesome-page', 'awesome');
    expect(result).toEqual([
      { text: 'awesome', isHighlighted: true },
      { text: '-page', isHighlighted: false },
    ]);
  });

  it('highlights match at the end', () => {
    const result = splitTitleBySearch('my-awesome', 'awesome');
    expect(result).toEqual([
      { text: 'my-', isHighlighted: false },
      { text: 'awesome', isHighlighted: true },
    ]);
  });

  it('highlights multiple occurrences', () => {
    const result = splitTitleBySearch('test-test-test', 'test');
    expect(result).toEqual([
      { text: 'test', isHighlighted: true },
      { text: '-', isHighlighted: false },
      { text: 'test', isHighlighted: true },
      { text: '-', isHighlighted: false },
      { text: 'test', isHighlighted: true },
    ]);
  });

  it('returns full title when no match found', () => {
    const result = splitTitleBySearch('my-page', 'xyz');
    expect(result).toEqual([{ text: 'my-page', isHighlighted: false }]);
  });

  it('highlights entire title when it matches exactly', () => {
    const result = splitTitleBySearch('hello', 'hello');
    expect(result).toEqual([{ text: 'hello', isHighlighted: true }]);
  });
});

describe('computeLabelPlacements', () => {
  it('returns empty array for no pages', () => {
    const result = computeLabelPlacements([], 'test', 5, 3);
    expect(result).toEqual([]);
  });

  it('places a single label above its node', () => {
    const pages = [{ pageId: 'p1', title: 'test-page', nodeX: 100, nodeY: 100, titleFilterColors: [] }];
    const result = computeLabelPlacements(pages, 'test', 5, 3);
    expect(result).toHaveLength(1);
    expect(result[0].pageId).toBe('p1');
    // Label should be above the node
    expect(result[0].labelY).toBeLessThan(100);
    expect(result[0].segments).toEqual([
      { text: 'test', isHighlighted: true },
      { text: '-page', isHighlighted: false },
    ]);
  });

  it('avoids overlapping labels for two nodes at the same position', () => {
    const pages = [
      { pageId: 'p1', title: 'page-one', nodeX: 100, nodeY: 100, titleFilterColors: [] },
      { pageId: 'p2', title: 'page-two', nodeX: 100, nodeY: 100, titleFilterColors: [] },
    ];
    const result = computeLabelPlacements(pages, 'page', 5, 3);
    expect(result).toHaveLength(2);
    // Labels should be at different positions
    const [l1, l2] = result;
    const samePosition = l1.labelX === l2.labelX && l1.labelY === l2.labelY;
    expect(samePosition).toBe(false);
  });

  it('does not need connector for labels close to their nodes', () => {
    const pages = [{ pageId: 'p1', title: 'page', nodeX: 50, nodeY: 50, titleFilterColors: [] }];
    const result = computeLabelPlacements(pages, 'pa', 5, 3);
    expect(result[0].needsConnector).toBe(false);
  });

  it('marks connector needed when label is displaced far from node', () => {
    // Create many pages at the same position to force displacement
    const pages = Array.from({ length: 15 }, (_, i) => ({
      pageId: `p${i}`,
      title: `page-number-${i}`,
      nodeX: 100,
      nodeY: 100,
      titleFilterColors: [],
    }));
    const result = computeLabelPlacements(pages, 'page', 5, 3);
    // At least one label should need a connector due to displacement
    const hasConnector = result.some(r => r.needsConnector);
    expect(hasConnector).toBe(true);
  });
});
