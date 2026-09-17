/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Infrastructure discovery only. Area APIs and their shell callers remain static imports. */
export async function importExtensionModule(filename: string, cacheKey?: string): Promise<unknown> {
  const resolved = fs.realpathSync(filename);
  const isAreaOrShell = (file: string) => {
    const segments = file.split(path.sep);
    return segments.some((segment, index) => segment === 'src' && (segments[index + 1] === 'areas'
      || (segments[index + 1] === 'shared' && segments[index + 2] === 'app-shell')));
  };
  if (isAreaOrShell(resolved) || isAreaOrShell(path.resolve(filename))) {
    throw new Error('Dynamic discovery cannot load app areas or their application shell. Use named imports through exported.ts.');
  }
  // Validate the real target while retaining the host’s chosen module identity.
  // Node may deliberately preserve symlink paths for mounted extensions.
  const moduleUrl = pathToFileURL(path.resolve(filename));
  if (cacheKey !== undefined) moduleUrl.searchParams.set('meadowMigration', cacheKey);
  return import(moduleUrl.href);
}
