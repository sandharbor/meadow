/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';

/** Resolve an authored fixture directory within the shared source graphs. */
export function fixtureSourceLocation(directory: string): { graph: string; subdirectory: string } {
  const relative = directory.replace(/^\.\/source_graphs\//, '');
  const parts = relative.split('/');
  if (relative === directory || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid fixture source directory: ${directory}`);
  }
  return { graph: parts[0], subdirectory: parts.slice(1).join('/') };
}

/** Keep machine paths out of saved fixtures, including nested registered roots. */
export function portableFixtureSourceDirectory(directory: string, sessionGraphs: string, authoredGraphs: string): string {
  const relative = path.relative(sessionGraphs, directory);
  if (!relative || path.isAbsolute(relative) || relative.split(path.sep).includes('..')) throw new Error(`Source directory is outside this fixture session: ${directory}`);
  const authored = path.join(authoredGraphs, relative);
  if (!fs.existsSync(authored) || !fs.statSync(authored).isDirectory()) throw new Error(`Source directory has no authored fixture counterpart: ${relative}`);
  return `./source_graphs/${relative.split(path.sep).join('/')}`;
}
