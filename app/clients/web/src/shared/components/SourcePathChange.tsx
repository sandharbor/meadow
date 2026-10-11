/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { DirectoryChange, PathChange, PathPresence } from './PathChange.js';
import { useSourcePath } from './SourceNames.js';

const SOURCE_ROOT = 'Source root';

/** A captured source path change, shown with registered source names. */
export function SourcePathChange({ before, after, compact = false }: { before: string; after: string; compact?: boolean }) {
  return <PathChange before={useSourcePath(before)} after={useSourcePath(after)} compact={compact} rootLabel={SOURCE_ROOT} testIdPrefix="source-path" />;
}

export function SourcePathPresence({ path, side }: { path: string; side: 'before' | 'after' }) {
  return <PathPresence path={useSourcePath(path)} side={side} testIdPrefix="source-path" />;
}

export function SourceDirectoryChange({ before, after }: { before: string; after: string }) {
  return <DirectoryChange before={useSourcePath(before)} after={useSourcePath(after)} rootLabel={SOURCE_ROOT} testId="source-directory-change" />;
}
