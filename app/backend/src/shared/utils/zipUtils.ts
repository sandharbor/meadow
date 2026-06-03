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
import { createHash } from 'crypto';
import archiver from 'archiver';

export const SOURCES_EXPORT_MANIFEST_FILENAME = 'sources-export-manifest.json';

interface CreateZipFromDirectoryOptions {
  archiveRootDirectory?: string;
}

interface CreateSourcesExportZipOptions {
  archiveRootDirectory?: string;
}

interface WriteSourcesExportManifestOptions {
  downloadFilename?: string;
}

// Yes, it looks weird that we're hardcoding a static date here. The reason:
// we need the zip to be byte-identical when the content hasn't changed (so the
// content-addressed hash stays stable and we don't re-upload unnecessarily).
// The export directory is rebuilt fresh each run from scrubbed source content,
// so the files always get "right now" as their mtime, even when nothing changed.
// We can't just preserve the original source file timestamps either, because
// those can shift without content changes (git checkout, Obsidian re-saving,
// rsync, etc.). A fixed date removes timestamps as a variable entirely: same
// content in, same zip bytes out.
const FIXED_ZIP_DATE = new Date('2024-01-01T00:00:00Z');

function walkFilesSorted(dir: string, base?: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  // Sort entries by name for deterministic ordering
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = base ? path.join(base, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...walkFilesSorted(fullPath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function normalizeArchiveRootDirectory(archiveRootDirectory?: string): string | undefined {
  const trimmed = archiveRootDirectory?.trim().replace(/^[/\\]+|[/\\]+$/g, '');
  if (!trimmed) return undefined;

  const segments = trimmed.split(/[/\\]+/);
  if (segments.some(segment => segment === '..')) {
    throw new Error(`Invalid ZIP archive root directory: ${archiveRootDirectory}`);
  }
  return segments.join('/');
}

function buildArchiveEntryName(relativePath: string, archiveRootDirectory?: string): string {
  const pathSegments = relativePath.split(path.sep).filter(Boolean);
  if (archiveRootDirectory) {
    return [archiveRootDirectory, ...pathSegments].join('/');
  }
  return pathSegments.join('/');
}

export function getSourcesExportDownloadFilename(siteSlug: string): string {
  return `${siteSlug}-sources.zip`;
}

/**
 * Creates a ZIP archive of a source directory and writes it to destPath.
 * Output is byte-deterministic: same input bytes produce the same zip bytes,
 * regardless of how many times files have been re-written, what their on-disk
 * mtimes are, or what their permissions happen to be.
 *
 * Three things matter for that:
 *   - Sorted file listing (walkFilesSorted) — entry order in the archive.
 *   - FIXED_ZIP_DATE on every entry — DOS timestamp in each header.
 *   - Explicit mode (0o644) on every entry — external file attributes in
 *     the central directory otherwise leak the file's actual chmod bits.
 *
 * Critically, we use `archive.append(buffer, ...)` rather than
 * `archive.file(path, ...)`. The path-based form reads files asynchronously
 * and writes entries in stat-completion order, which means the sorted call
 * order does NOT translate into a sorted archive — the sequence of entries
 * within the archive can vary run to run. Pre-reading into a buffer
 * sidesteps that and forces strict enqueue order.
 */
export async function createZipFromDirectory(
  sourceDir: string,
  destPath: string,
  options: CreateZipFromDirectoryOptions = {}
): Promise<void> {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  const archiveRootDirectory = normalizeArchiveRootDirectory(options.archiveRootDirectory);

  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  return new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(destPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err: Error) => reject(err));
    output.on('close', () => resolve());

    archive.pipe(output);

    const files = walkFilesSorted(sourceDir);
    for (const relativePath of files) {
      const fullPath = path.join(sourceDir, relativePath);
      const fileContent = fs.readFileSync(fullPath);
      archive.append(fileContent, {
        name: buildArchiveEntryName(relativePath, archiveRootDirectory),
        date: FIXED_ZIP_DATE,
        mode: 0o644,
      });
    }

    void archive.finalize();
  });
}

/**
 * Creates a content-addressed ZIP of the exported source content.
 * The ZIP filename includes a hash prefix for cache-busting.
 *
 * @returns The filename of the generated ZIP (e.g. "sources-export-a1b2c3d4e5f6.zip"),
 *          or null if there was nothing to zip.
 */
export async function createSourcesExportZip(
  trackedContentDir: string,
  outputDir: string,
  options: CreateSourcesExportZipOptions = {}
): Promise<string | null> {
  if (!fs.existsSync(trackedContentDir)) {
    return null;
  }

  // Generate to a temp name first, then rename with hash
  const tempZipPath = path.join(outputDir, 'sources-export-temp.zip');
  await createZipFromDirectory(trackedContentDir, tempZipPath, {
    archiveRootDirectory: options.archiveRootDirectory,
  });

  // Hash the zip content
  const hash = createHash('sha256');
  const zipContent = fs.readFileSync(tempZipPath);
  hash.update(zipContent);
  const hashPrefix = hash.digest('hex').substring(0, 12);

  // Rename to content-addressed filename
  const finalFilename = `sources-export-${hashPrefix}.zip`;
  const finalPath = path.join(outputDir, finalFilename);

  // Remove any previous sources-export zips, plus legacy markdown-export zips.
  const existingFiles = fs.readdirSync(outputDir);
  for (const file of existingFiles) {
    const isSourcesExportZip = file.startsWith('sources-export-') && file.endsWith('.zip') && file !== 'sources-export-temp.zip';
    const isLegacyMarkdownExportZip = file.startsWith('markdown-export-') && file.endsWith('.zip');
    if (isSourcesExportZip || isLegacyMarkdownExportZip) {
      fs.unlinkSync(path.join(outputDir, file));
    }
  }

  fs.renameSync(tempZipPath, finalPath);

  return finalFilename;
}

export function writeSourcesExportManifest(
  outputDir: string,
  zipFilename: string | null,
  options: WriteSourcesExportManifestOptions = {}
): void {
  const manifestPath = path.join(outputDir, SOURCES_EXPORT_MANIFEST_FILENAME);

  if (!zipFilename) {
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
    }
    return;
  }

  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ zipFilename, downloadFilename: options.downloadFilename ?? zipFilename }),
    'utf8'
  );
}
