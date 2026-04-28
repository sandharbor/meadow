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

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

/** Cargo’s output name on Windows is `<name>.exe`; Unix has no extension. */
function nativeRustExecutableFileName(binaryName: string): string {
  if (process.platform === 'win32' && !binaryName.toLowerCase().endsWith('.exe')) {
    return `${binaryName}.exe`;
  }
  return binaryName;
}

export type ResolveNativeRustBinaryFromNativeUtilsParentOptions = {
  /** Directory that contains `native_utils` (usually the repo `app/` folder). */
  nativeUtilsParentDir: string;
  /** Segments under `native_utils/` to the Cargo crate root (contains `target/`). */
  cratePathSegments: string[];
  /** Built binary name (e.g. `fast_git_ops_bin`). */
  binaryName: string;
  /** When set and present in `process.env`, that value is returned instead. */
  envVar?: string;
};

/**
 * Resolves `app/native_utils/.../target/{release|debug}/<binary>` from the directory above `native_utils`.
 */
export function resolveNativeRustBinaryPathFromNativeUtilsParent(
  options: ResolveNativeRustBinaryFromNativeUtilsParentOptions
): string {
  const { nativeUtilsParentDir, cratePathSegments, binaryName, envVar } = options;
  if (envVar && process.env[envVar]) {
    return process.env[envVar]!;
  }
  const exeName = nativeRustExecutableFileName(binaryName);
  const crateRoot = path.resolve(nativeUtilsParentDir, 'native_utils', ...cratePathSegments);
  const releasePath = path.resolve(crateRoot, 'target', 'release', exeName);
  const debugPath = path.resolve(crateRoot, 'target', 'debug', exeName);
  if (fs.existsSync(releasePath)) return releasePath;
  if (fs.existsSync(debugPath)) return debugPath;
  return releasePath;
}

export type ResolveNativeRustBinaryPathOptions = {
  /** Typically `import.meta.url` from the caller module. */
  importMetaUrl: string;
  /** Number of `..` steps from this file's directory to reach the parent of `native_utils` (usually `app/`). */
  upLevelsToApp: number;
  /** Segments under `native_utils/` leading to the Cargo crate root (contains `target/`). */
  cratePathSegments: string[];
  /** Built binary name (e.g. `fast_git_ops_bin`). */
  binaryName: string;
  /** When set and present in `process.env`, that value is returned instead. */
  envVar?: string;
};

/**
 * Resolves the path to a Rust binary under `native_utils/.../target/{release|debug}/`.
 * Uses `fileURLToPath` so Windows file URLs do not produce `C:\\C:\\...` paths.
 */
export function resolveNativeRustBinaryPath(options: ResolveNativeRustBinaryPathOptions): string {
  const thisFileDir = path.dirname(fileURLToPath(options.importMetaUrl));
  const upSegments = Array.from({ length: options.upLevelsToApp }, () => '..');
  const nativeUtilsParentDir = path.resolve(thisFileDir, ...upSegments);
  return resolveNativeRustBinaryPathFromNativeUtilsParent({
    nativeUtilsParentDir,
    cratePathSegments: options.cratePathSegments,
    binaryName: options.binaryName,
    envVar: options.envVar,
  });
}
