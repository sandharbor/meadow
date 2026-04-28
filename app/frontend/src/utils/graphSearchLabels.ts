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

export interface TextSegment {
  text: string;
  isHighlighted: boolean;
}

export interface LabelPlacement {
  pageId: string;
  nodeX: number;
  nodeY: number;
  labelX: number;
  labelY: number;
  segments: TextSegment[];
  needsConnector: boolean;
  titleFilterColors: string[];
}

interface PageInput {
  pageId: string;
  title: string;
  nodeX: number;
  nodeY: number;
  titleFilterColors: string[];
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Splits a title into segments, highlighting all occurrences of the search text.
 * Case-insensitive matching.
 */
export function splitTitleBySearch(title: string, searchText: string): TextSegment[] {
  if (!searchText || searchText.length < 2) {
    return [{ text: title, isHighlighted: false }];
  }

  const segments: TextSegment[] = [];
  const titleLower = title.toLowerCase();
  const searchLower = searchText.toLowerCase();
  let lastIndex = 0;

  let matchIndex = titleLower.indexOf(searchLower, lastIndex);
  while (matchIndex !== -1) {
    // Add non-highlighted text before this match
    if (matchIndex > lastIndex) {
      segments.push({ text: title.slice(lastIndex, matchIndex), isHighlighted: false });
    }
    // Add highlighted match (preserving original case)
    segments.push({ text: title.slice(matchIndex, matchIndex + searchText.length), isHighlighted: true });
    lastIndex = matchIndex + searchText.length;
    matchIndex = titleLower.indexOf(searchLower, lastIndex);
  }

  // Add remaining text after last match
  if (lastIndex < title.length) {
    segments.push({ text: title.slice(lastIndex), isHighlighted: false });
  }

  // If no matches found, return full title unhighlighted
  if (segments.length === 0) {
    return [{ text: title, isHighlighted: false }];
  }

  return segments;
}

function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function overlapsAny(box: BoundingBox, placed: BoundingBox[]): boolean {
  return placed.some(p => boxesOverlap(box, p));
}

/**
 * Computes non-overlapping label placements for search-matched pages.
 * Uses a greedy algorithm: for each label, tries several candidate positions
 * and picks the first one that doesn't overlap with already-placed labels.
 */
export function computeLabelPlacements(
  pages: PageInput[],
  searchText: string,
  pageRadius: number,
  fontSize: number,
): LabelPlacement[] {
  if (pages.length === 0) return [];

  const charWidth = fontSize * 0.55;
  const labelHeight = fontSize * 1.6;
  const padding = fontSize * 0.4;
  const connectorThreshold = pageRadius * 6;

  // Build initial data with segments
  const items = pages.map(p => ({
    ...p,
    segments: splitTitleBySearch(p.title, searchText),
    width: p.title.length * charWidth + padding * 2,
    height: labelHeight,
  }));

  // Sort by Y then X for deterministic placement
  items.sort((a, b) => a.nodeY - b.nodeY || a.nodeX - b.nodeX);

  const placements: LabelPlacement[] = [];
  const placedBoxes: BoundingBox[] = [];

  for (const item of items) {
    const { pageId, nodeX, nodeY, segments, width, height } = item;

    // Candidate positions: [dx, dy] offsets from node center
    const aboveY = nodeY - pageRadius - height - fontSize * 0.3;
    const belowY = nodeY + pageRadius + fontSize * 0.3;
    const candidates = [
      { x: nodeX - width / 2, y: aboveY },                          // above
      { x: nodeX - width / 2, y: belowY },                          // below
      { x: nodeX - width / 2, y: aboveY - height * 1.5 },           // further above
      { x: nodeX - width / 2 - width * 0.6, y: aboveY },            // above-left
      { x: nodeX - width / 2 + width * 0.6, y: aboveY },            // above-right
    ];

    let bestBox: BoundingBox | null = null;
    let bestX = candidates[0].x;
    let bestY = candidates[0].y;

    for (const candidate of candidates) {
      const box: BoundingBox = { x: candidate.x, y: candidate.y, width, height };
      if (!overlapsAny(box, placedBoxes)) {
        bestBox = box;
        bestX = candidate.x;
        bestY = candidate.y;
        break;
      }
    }

    // If all candidates overlap, use cumulative vertical offset
    if (!bestBox) {
      let offsetY = aboveY - height * 3;
      for (let i = 0; i < 10; i++) {
        const box: BoundingBox = { x: nodeX - width / 2, y: offsetY, width, height };
        if (!overlapsAny(box, placedBoxes)) {
          bestBox = box;
          bestX = box.x;
          bestY = box.y;
          break;
        }
        offsetY -= height * 1.2;
      }
      // Last resort: just use the final offset position
      if (!bestBox) {
        bestBox = { x: nodeX - width / 2, y: offsetY, width, height };
        bestX = bestBox.x;
        bestY = bestBox.y;
      }
    }

    placedBoxes.push(bestBox);

    // Label center position (for text anchor)
    const labelCenterX = bestX + width / 2;
    const labelCenterY = bestY + height / 2;

    // Check if connector is needed
    const dx = labelCenterX - nodeX;
    const dy = labelCenterY - nodeY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const needsConnector = dist > connectorThreshold;

    placements.push({
      pageId,
      nodeX,
      nodeY,
      labelX: labelCenterX,
      labelY: labelCenterY,
      segments,
      needsConnector,
      titleFilterColors: item.titleFilterColors,
    });
  }

  return placements;
}
