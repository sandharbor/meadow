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
import zlib from 'zlib';
import { Buffer } from 'node:buffer';

/**
 * Per-site manifest declaring which generated assets are stored on disk in a
 * pre-compressed form. Lives at `_mw_assets/_compression.json` inside the
 * preview output (and is copied into the published / versioned output by the
 * normal copy-everything-to-the-versioned-dir step).
 *
 * Read by:
 *   - the preview HTTP route (sets Content-Encoding when serving)
 *   - the S3 publish path (sets ContentEncoding metadata on the object)
 *   - the local-export path (re-inflates so file:// users get usable bytes)
 *
 * The URL filename (which is content-addressed via an 8-char SHA256 hash of
 * the *original* uncompressed bytes) stays stable across compression form,
 * so HTML references don't have to change between preview/publish/export.
 */
export const COMPRESSION_MANIFEST_FILENAME = '_compression.json';

export interface CompressionManifest {
  /** Paths relative to the directory the manifest lives in. */
  gzip: string[];
}

export function readCompressionManifest(assetsDir: string): CompressionManifest | null {
  const manifestPath = path.join(assetsDir, COMPRESSION_MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) return null;
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as CompressionManifest;
  return { gzip: Array.isArray(parsed.gzip) ? parsed.gzip : [] };
}

export function writeCompressionManifest(assetsDir: string, manifest: CompressionManifest): void {
  const manifestPath = path.join(assetsDir, COMPRESSION_MANIFEST_FILENAME);
  // Sort for deterministic on-disk output — the manifest is small but the
  // determinism story is easier to reason about if every artifact is stable.
  const sorted: CompressionManifest = { gzip: [...manifest.gzip].sort() };
  fs.writeFileSync(manifestPath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

/**
 * Build a Set of relative paths (relative to the assets dir) that the manifest
 * marks as gzip-encoded, given an arbitrary file path under the dir hierarchy
 * in which the manifest lives.
 *
 * Returns null if no manifest is present, so callers can fast-path the
 * common "site has no pre-compressed assets" case.
 */
export function loadGzipPathSet(assetsDir: string): Set<string> | null {
  const manifest = readCompressionManifest(assetsDir);
  if (!manifest) return null;
  return new Set(manifest.gzip);
}

/**
 * gzip a buffer with output that's byte-identical across runs and machines.
 *
 * - Z_BEST_COMPRESSION level for size.
 * - mtime field already defaults to 0 in modern Node, so no patch needed.
 * - OS byte (header byte 9) is patched to 0xFF ("unknown") so the same input
 *   produces the same bytes whether built on macOS, Linux, etc. Not strictly
 *   needed for in-process determinism — included so cross-machine builds also
 *   line up, which keeps S3 Etags stable across developers.
 */
const GZIP_HEADER_OS_OFFSET = 9;

export function deterministicGzip(input: Buffer): Buffer {
  const out = zlib.gzipSync(input, { level: zlib.constants.Z_BEST_COMPRESSION });
  out[GZIP_HEADER_OS_OFFSET] = 0xff;
  return out;
}
