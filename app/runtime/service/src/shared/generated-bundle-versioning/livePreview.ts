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

import fs from 'fs';
import path from 'path';
import { currentGeneratedBundleVersionDirectory } from './generatedBundleVersionManifestService.js';

// Only a running renderer can register a live preview. It is never a saved,
// exportable version, and recovery cannot revive a partially rendered tree.
const liveDirectories = new Map<string, string>();

export function showLivePreview(bundleDirectory: string, stagingDirectory: string): void {
  liveDirectories.set(bundleDirectory, stagingDirectory);
}

export function clearLivePreview(bundleDirectory: string, stagingDirectory: string): void {
  if (liveDirectories.get(bundleDirectory) === stagingDirectory) liveDirectories.delete(bundleDirectory);
}

export function previewFileDirectory(bundleDirectory: string, relativePath: string): string | null {
  const live = liveDirectories.get(bundleDirectory);
  if (live && fs.existsSync(path.join(live, relativePath))) return live;
  return currentGeneratedBundleVersionDirectory(bundleDirectory);
}

/** Read the newly rendered page under its stable installed path in Changes. */
export function livePreviewFilePath(bundleDirectory: string, filePath: string): string {
  const live = liveDirectories.get(bundleDirectory);
  if (!live) return filePath;
  const current = currentGeneratedBundleVersionDirectory(bundleDirectory);
  if (!current) return filePath;
  const relativePath = path.relative(current, filePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return filePath;
  const candidate = path.join(live, relativePath);
  return fs.existsSync(candidate) ? candidate : filePath;
}
