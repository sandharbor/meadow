/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Run names may contain a timestamp or a fixture identifier. */
export function runsNewestFirst(root: string): { runId: string; createdAt: string }[] {
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('__'))
    .map(entry => {
      const directory = path.join(root, entry.name);
      const match = entry.name.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
      let started = match ? Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}`) : NaN;
      if (!Number.isFinite(started)) {
        const recorded = readdirSync(directory, { withFileTypes: true }).flatMap(scenario => {
          if (!scenario.isDirectory() || scenario.name.startsWith('__')) return [];
          try {
            const manifest = JSON.parse(readFileSync(path.join(directory, scenario.name, 'manifest.json'), 'utf8'));
            const time = typeof manifest.startTime === 'string' ? Date.parse(manifest.startTime) : NaN;
            return Number.isFinite(time) ? [time] : [];
          } catch { return []; }
        });
        if (recorded.length) started = Math.min(...recorded);
      }
      if (!Number.isFinite(started)) {
        const stats = statSync(directory);
        started = stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.mtimeMs;
      }
      return { runId: entry.name, createdAt: new Date(started).toISOString() };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.runId.localeCompare(a.runId));
}
