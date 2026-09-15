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

/** Utilities for node specs stored beside their source files. */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import type { NodespecsBlock, NodespecEntry } from './types.js';

export function getNodespecForBundle(block: NodespecsBlock, bundleName: string): NodespecEntry | undefined {
  return block.nodespecs.find(spec => spec.bundle === bundleName);
}

export function getReferencedBundles(block: NodespecsBlock): string[] {
  return block.nodespecs.map(spec => spec.bundle);
}

/**
 * Detects whether a markdown file is an Obsidian Excalidraw drawing by content.
 * Obsidian's Excalidraw plugin marks files with `excalidraw-plugin: parsed` in
 * the YAML frontmatter. Mirrors the Rust detection in working_graph_code.
 */
export function isExcalidrawMarkdown(content: string): boolean {
  if (!content.startsWith('---')) {
    return false;
  }
  const afterOpen = content.slice(3);
  const closeIdx = afterOpen.indexOf('\n---');
  if (closeIdx === -1) {
    return false;
  }
  const frontmatter = afterOpen.slice(0, closeIdx);
  return frontmatter.includes('excalidraw-plugin: parsed');
}

/** Every source format uses the full source filename followed by `.nodespec.yaml`. */
export function getSidecarNodespecPath(sourceFilePath: string): string {
  return `${sourceFilePath}.nodespec.yaml`;
}

/** Parse the YAML document; validation reports errors in its individual entries. */
export function parseNodespecSidecarContent(content: string): NodespecsBlock | null {
  try {
    const parsed = YAML.parse(content) as NodespecsBlock;
    if (parsed && Array.isArray(parsed.nodespecs)) return parsed;
  } catch {
    // Invalid YAML is reported by the fixture validation tests.
  }
  return null;
}

/** Recover the exact source path without inspecting its contents or guessing its type. */
export function sourceFileForSidecarPath(sidecarPath: string): string | null {
  const suffix = '.nodespec.yaml';
  if (!sidecarPath.endsWith(suffix) || path.basename(sidecarPath) === suffix) return null;
  return sidecarPath.slice(0, -suffix.length);
}

/** Load only the paired YAML file. Node contents are never parsed as specifications. */
export function getNodespecBlock(sourceFilePath: string): {
  block: NodespecsBlock | null;
  source: 'sidecar' | 'none';
  sourcePath: string;
} {
  const sourcePath = getSidecarNodespecPath(sourceFilePath);
  try {
    const content = fs.readFileSync(sourcePath, 'utf-8');
    return { block: parseNodespecSidecarContent(content), source: 'sidecar', sourcePath };
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    return { block: null, source: 'none', sourcePath };
  }
}
