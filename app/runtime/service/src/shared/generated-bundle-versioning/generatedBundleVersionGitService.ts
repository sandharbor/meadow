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
import { spawn, spawnSync } from 'child_process';
import type { GeneratedBundleVersionId } from '../../../../../contracts/types/generatedBundleVersioning.js';
import { findGitRoot } from '../utils/configFileExplorerUtils.js';
import { generatedBundleVersionDirectory } from './generatedBundleVersionManifestService.js';
import { generationRecordPaths } from './generationRecords.js';

export interface GeneratedVersionGitChange {
  status: string;
  relativePath: string;
}

export interface GeneratedVersionGitState {
  savedGenerationId: string | null;
  /** Generated files and their local generation records both match HEAD. */
  isSaved: boolean;
  changes: GeneratedVersionGitChange[];
  /** Local generation-record files that differ from HEAD (outside the generated website). */
  recordChanges: GeneratedVersionGitChange[];
}


function requireGitRoot(bundleDirectory: string): string {
  const gitRoot = findGitRoot(bundleDirectory);
  if (!gitRoot) throw new Error(`No Git repository contains bundle directory ${bundleDirectory}`);
  return gitRoot;
}

function repositoryRelativePath(gitRoot: string, absolutePath: string): string {
  const relativePath = path.relative(gitRoot, absolutePath);
  if (relativePath === '' || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`Path ${absolutePath} is not a child of Git repository ${gitRoot}`);
  }
  return relativePath.split(path.sep).join('/');
}

function runGit(
  gitRoot: string,
  args: string[],
  options: { allowFailure?: boolean; encoding?: NodeJS.BufferEncoding | 'buffer' } = {},
): string | Buffer {
  const encoding = options.encoding === 'buffer' ? undefined : (options.encoding ?? 'utf8');
  const result = spawnSync('git', args, {
    cwd: gitRoot,
    encoding,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
    throw new Error(`git ${args[0]} failed: ${(stderr || '').trim() || `exit ${result.status}`}`);
  }
  return result.stdout ?? (encoding ? '' : Buffer.alloc(0));
}

function trackedFilesAtHead(gitRoot: string, repositoryVersionPath: string): Set<string> {
  const output = runGit(
    gitRoot,
    ['ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', repositoryVersionPath],
    { allowFailure: true, encoding: 'buffer' },
  ) as Buffer;
  const prefix = `${repositoryVersionPath}/`;
  return new Set(
    output.toString('utf8').split('\0').filter(Boolean).map((entry) =>
      entry.startsWith(prefix) ? entry.slice(prefix.length) : entry
    ),
  );
}

function workingFiles(versionDirectory: string): Set<string> {
  const files = new Set<string>();
  if (!fs.existsSync(versionDirectory)) return files;
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(versionDirectory, absolutePath).split(path.sep).join('/');
      if (entry.isDirectory()) visit(absolutePath);
      else files.add(relativePath);
    }
  };
  visit(versionDirectory);
  return files;
}

function statusChanges(gitRoot: string, repositoryVersionPath: string): GeneratedVersionGitChange[] {
  const output = runGit(
    gitRoot,
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--', repositoryVersionPath],
    { encoding: 'buffer' },
  ) as Buffer;
  const prefix = `${repositoryVersionPath}/`;
  return output.toString('utf8').split('\0').filter(Boolean).map((entry) => {
    const repositoryPath = entry.slice(3);
    return {
      status: entry.slice(0, 2),
      relativePath: repositoryPath.startsWith(prefix) ? repositoryPath.slice(prefix.length) : repositoryPath,
    };
  });
}

export function deriveSavedGenerationId(
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
): string | null {
  const gitRoot = requireGitRoot(bundleDirectory);
  const repositoryVersionPath = repositoryRelativePath(
    gitRoot,
    generatedBundleVersionDirectory(bundleDirectory, versionId),
  );
  const headExists = (runGit(gitRoot, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true }) as string).trim();
  if (!headExists) return null;
  const output = (runGit(gitRoot, ['ls-tree', '-d', 'HEAD', '--', repositoryVersionPath]) as string).trim();
  if (!output) return null;
  const match = output.match(/^\d+\s+tree\s+([0-9a-f]{40}|[0-9a-f]{64})\t/);
  if (!match) throw new Error(`HEAD entry for ${repositoryVersionPath} is not a Git tree`);
  return match[1];
}

export function inspectGeneratedVersionGitState(
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
): GeneratedVersionGitState {
  const gitRoot = requireGitRoot(bundleDirectory);
  const versionDirectory = generatedBundleVersionDirectory(bundleDirectory, versionId);
  const repositoryVersionPath = repositoryRelativePath(gitRoot, versionDirectory);
  const savedGenerationId = deriveSavedGenerationId(bundleDirectory, versionId);
  const changes = statusChanges(gitRoot, repositoryVersionPath);

  if (savedGenerationId !== null) {
    const tracked = trackedFilesAtHead(gitRoot, repositoryVersionPath);
    const reportedPaths = new Set(changes.map((change) => change.relativePath));
    for (const relativePath of workingFiles(versionDirectory)) {
      if (!tracked.has(relativePath) && !reportedPaths.has(relativePath)) {
        changes.push({ status: '??', relativePath });
      }
    }
  }

  changes.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const recordChanges = generationRecordStatusChanges(gitRoot, bundleDirectory, versionId);
  return {
    savedGenerationId,
    isSaved: savedGenerationId !== null && fs.existsSync(versionDirectory) && changes.length === 0
      && recordChanges.length === 0,
    changes,
    recordChanges,
  };
}

function generationRecordStatusChanges(
  gitRoot: string,
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
): GeneratedVersionGitChange[] {
  const paths = generationRecordPaths(bundleDirectory, versionId);
  const repositoryPaths = [paths.inputs, paths.output].map(filePath => repositoryRelativePath(gitRoot, filePath));
  const output = runGit(
    gitRoot,
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--', ...repositoryPaths],
    { encoding: 'buffer' },
  ) as Buffer;
  return output.toString('utf8').split('\0').filter(Boolean).map(entry => ({
    status: entry.slice(0, 2),
    relativePath: entry.slice(3),
  }));
}

export function resolveHeadCommit(bundleDirectory: string): string | null {
  const gitRoot = requireGitRoot(bundleDirectory);
  const head = (runGit(gitRoot, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { allowFailure: true }) as string).trim();
  return head || null;
}

/** Exact bytes of a file at a commit, or null when it is absent there. */
export function readFileAtCommit(bundleDirectory: string, commit: string, absolutePath: string): Buffer | null {
  const gitRoot = requireGitRoot(bundleDirectory);
  const repositoryPath = repositoryRelativePath(gitRoot, absolutePath);
  const result = spawnSync('git', ['cat-file', 'blob', `${commit}:${repositoryPath}`], {
    cwd: gitRoot,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result.status === 0 ? result.stdout : null;
}

/** Relative path → blob ID for a version directory at a commit, or null when it is absent there. */
export function generatedTreeFilesAtCommit(
  bundleDirectory: string,
  commit: string,
  versionId: GeneratedBundleVersionId,
): { savedGenerationId: string; files: Map<string, string> } | null {
  const gitRoot = requireGitRoot(bundleDirectory);
  const repositoryVersionPath = repositoryRelativePath(gitRoot, generatedBundleVersionDirectory(bundleDirectory, versionId));
  const listed = (runGit(gitRoot, ['ls-tree', '-d', commit, '--', repositoryVersionPath], { allowFailure: true }) as string).trim();
  const match = listed.match(/^\d+\s+tree\s+([0-9a-f]{40}|[0-9a-f]{64})\t/);
  if (!match) return null;
  return { savedGenerationId: match[1], files: generatedTreeFiles(bundleDirectory, match[1]) };
}

/** Relative path → blob ID for a retained generated tree object. */
export function generatedTreeFiles(bundleDirectory: string, treeId: string): Map<string, string> {
  return treeFileObjectIds(requireGitRoot(bundleDirectory), treeId);
}

/** Exact bytes of a blob, or null when the repository no longer has it. */
export function readGitBlob(bundleDirectory: string, objectId: string): Buffer | null {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(objectId)) return null;
  const result = spawnSync('git', ['cat-file', 'blob', objectId], {
    cwd: requireGitRoot(bundleDirectory),
    maxBuffer: 200 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result.status === 0 ? result.stdout : null;
}

/** Exact bytes of many blobs through one Git process; absent blobs are omitted. */
export async function readGitBlobs(bundleDirectory: string, objectIds: readonly string[]): Promise<Map<string, Buffer>> {
  const requested = [...new Set(objectIds.filter(objectId => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(objectId)))];
  const blobs = new Map<string, Buffer>();
  if (requested.length === 0) return blobs;
  const output = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn('git', ['cat-file', '--batch'], { cwd: requireGitRoot(bundleDirectory) });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`git cat-file exited ${code}`)));
    child.stdin.on('error', reject);
    child.stdin.end(`${requested.join('\n')}\n`);
  });
  let offset = 0;
  while (offset < output.length) {
    const lineEnd = output.indexOf(0x0a, offset);
    if (lineEnd < 0) break;
    const [objectId, type, size] = output.subarray(offset, lineEnd).toString('utf8').split(' ');
    offset = lineEnd + 1;
    if (type === 'missing' || size === undefined) continue;
    const length = Number(size);
    if (type === 'blob') blobs.set(objectId, output.subarray(offset, offset + length));
    offset += length + 1;
  }
  return blobs;
}

export function hasGitRepository(bundleDirectory: string): boolean {
  return findGitRoot(bundleDirectory) !== null;
}

function untrackedAndIgnoredPaths(gitRoot: string, repositoryVersionPath: string): string[] {
  const list = (args: string[]): string[] => {
    const output = runGit(gitRoot, args, { encoding: 'buffer' }) as Buffer;
    return output.toString('utf8').split('\0').filter(Boolean);
  };
  return [...new Set([
    ...list(['ls-files', '--others', '--exclude-standard', '-z', '--', repositoryVersionPath]),
    ...list(['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', repositoryVersionPath]),
  ])];
}

export function restoreGeneratedVersionFromGit(
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
): GeneratedVersionGitState {
  const gitRoot = requireGitRoot(bundleDirectory);
  const versionDirectory = generatedBundleVersionDirectory(bundleDirectory, versionId);
  const repositoryVersionPath = repositoryRelativePath(gitRoot, versionDirectory);
  if (deriveSavedGenerationId(bundleDirectory, versionId) === null) {
    throw new Error(`Version ${versionId} has no saved generation to restore`);
  }

  const removableRepositoryPaths = untrackedAndIgnoredPaths(gitRoot, repositoryVersionPath);
  for (const removableRepositoryPath of removableRepositoryPaths) {
    const absolutePath = path.resolve(gitRoot, removableRepositoryPath);
    const relativeToVersion = path.relative(versionDirectory, absolutePath);
    if (relativeToVersion === '..' || relativeToVersion.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToVersion)) {
      throw new Error(`Refusing to remove path outside version directory: ${absolutePath}`);
    }
    fs.rmSync(absolutePath, { recursive: true, force: true });
  }

  runGit(gitRoot, ['restore', '--source=HEAD', '--staged', '--worktree', '--', repositoryVersionPath]);
  restoreGenerationRecordsFromHead(bundleDirectory, versionId);
  const restored = inspectGeneratedVersionGitState(bundleDirectory, versionId);
  if (!restored.isSaved) throw new Error(`Version ${versionId} did not match its saved generation after restore`);
  return restored;
}

/**
 * Return a version's local generation records to their saved state, including
 * legitimate absence for a result saved before the records existed.
 */
export function restoreGenerationRecordsFromHead(bundleDirectory: string, versionId: GeneratedBundleVersionId): void {
  const gitRoot = requireGitRoot(bundleDirectory);
  const paths = generationRecordPaths(bundleDirectory, versionId);
  for (const filePath of [paths.inputs, paths.output]) {
    const repositoryPath = repositoryRelativePath(gitRoot, filePath);
    const tracked = (runGit(gitRoot, ['ls-tree', '--name-only', 'HEAD', '--', repositoryPath], { allowFailure: true }) as string).trim();
    if (tracked) {
      runGit(gitRoot, ['restore', '--source=HEAD', '--staged', '--worktree', '--', repositoryPath]);
    } else {
      runGit(gitRoot, ['rm', '--cached', '--quiet', '--ignore-unmatch', '--', repositoryPath], { allowFailure: true });
      fs.rmSync(filePath, { force: true });
    }
  }
}

function treeFileObjectIds(gitRoot: string, treeId: string): Map<string, string> {
  const output = runGit(gitRoot, ['ls-tree', '-r', '-z', treeId], { encoding: 'buffer' }) as Buffer;
  const files = new Map<string, string>();
  for (const entry of output.toString('utf8').split('\0').filter(Boolean)) {
    const match = entry.match(/^\d+\s+blob\s+([0-9a-f]+)\t([\s\S]+)$/);
    if (match) files.set(match[2], match[1]);
  }
  return files;
}
