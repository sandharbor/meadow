/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/** Inspect the scenario's isolated source, independently of the UI's sensitivity label. */
export function sourceSensitivity(file: string): unknown {
  const source = readFileSync(file, 'utf8');
  const frontMatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  return frontMatter ? (parse(frontMatter) as Record<string, unknown>)?.['meadow-sensitive'] : undefined;
}
