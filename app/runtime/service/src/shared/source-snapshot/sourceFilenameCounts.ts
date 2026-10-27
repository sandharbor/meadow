/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';

/** Count names across registered sources, including pages outside the admitted graph, without reading bodies. */
export function captureFilenameCounts(roots: string[], admitted: string[]): Record<string, number> {
  const counts = Object.fromEntries(admitted.map(filename => [path.posix.basename(filename).toLowerCase(), 0]));
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.endsWith('.nodespec.yaml') || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(path.join(directory, entry.name));
      else if (entry.isFile() && Object.prototype.hasOwnProperty.call(counts, entry.name.toLowerCase())) counts[entry.name.toLowerCase()] += 1;
    }
  };
  roots.forEach(visit);
  return counts;
}
