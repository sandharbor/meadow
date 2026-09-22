/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { FixtureSourceLocation } from '../../../../../shared_code/shared_dev/fixtureSourceLocation.js';
import type { SourceChangeDefinition, SourceChangeOperation } from '../../../../../shared_code/shared_dev/sourceChangesTypes.js';
import { sourceLocationLabel } from '../../../../../shared_code/utils/bundleSourceUtils.js';

/** Format only operation targets; replacement contents and payload filenames retain their literal values. */
export function displaySourceChangeOperations(change: Pick<SourceChangeDefinition, 'sourceGraph' | 'operations'>, locations: readonly FixtureSourceLocation[]): SourceChangeOperation[] {
  const sources = locations.filter(location => location.graph === change.sourceGraph && location.name)
    .sort((a, b) => b.subdirectory.length - a.subdirectory.length);
  const displayPath = (path: string): string => {
    const source = sources.find(source => !source.subdirectory || path === source.subdirectory || path.startsWith(`${source.subdirectory}/`));
    return source ? sourceLocationLabel(source.name!, source.subdirectory ? path.slice(source.subdirectory.length).replace(/^\//, '') : path) : path;
  };
  return change.operations.map(operation => {
    if ('delete' in operation) return { delete: displayPath(operation.delete) };
    if ('move' in operation) return { move: { from: displayPath(operation.move.from), to: displayPath(operation.move.to) } };
    if ('write' in operation) return { write: { ...operation.write, path: displayPath(operation.write.path) } };
    return { replaceText: { ...operation.replaceText, path: displayPath(operation.replaceText.path) } };
  });
}
