/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

export const boundaryAreaOrder = ['bundle/sourcing', 'bundle/curation', 'bundle/generation', 'bundle/review', 'bundle/sharing'] as const;

interface BoundaryOrderEntry {
  areaIds: readonly string[];
  name: string;
  file: string;
  id: string;
}

/** Compare participating areas in workflow order, with a shorter prefix first. */
export function compareBoundaryAreas(left: BoundaryOrderEntry, right: BoundaryOrderEntry): number {
  const indexes = (entry: BoundaryOrderEntry) => boundaryAreaOrder.flatMap((id, index) => entry.areaIds.includes(id) ? [index] : []);
  const a = indexes(left), b = indexes(right);
  if (!a.length || !b.length) return b.length - a.length;
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length || left.name.localeCompare(right.name) || left.file.localeCompare(right.file) || left.id.localeCompare(right.id);
}
