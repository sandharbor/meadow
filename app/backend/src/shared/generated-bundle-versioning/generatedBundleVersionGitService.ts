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
import { spawnSync } from 'child_process';
import type { GeneratedBundleVersionId } from '../../../../shared_code/types/generatedBundleVersioning.js';
import { findGitRoot } from '../utils/configFileExplorerUtils.js';
import { generatedBundleVersionDirectory } from './generatedBundleVersionManifestService.js';

export interface GeneratedVersionGitChange {
  status: string;
  relativePath: string;
}

export interface GeneratedVersionGitState {
  savedGenerationId: string | null;
  isSaved: boolean;
  changes: GeneratedVersionGitChange[];
}

export interface GeneratedVersionComparisonChange {
  status: 'added' | 'modified' | 'deleted';
  relativePath: string;
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
  return {
    savedGenerationId,
    isSaved: savedGenerationId !== null && fs.existsSync(versionDirectory) && changes.length === 0,
    changes,
  };
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
  const restored = inspectGeneratedVersionGitState(bundleDirectory, versionId);
  if (!restored.isSaved) throw new Error(`Version ${versionId} did not match its saved generation after restore`);
  return restored;
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

function workingFileObjectIds(gitRoot: string, directory: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const relativePath of workingFiles(directory)) {
    const absolutePath = path.join(directory, ...relativePath.split('/'));
    const objectId = (runGit(gitRoot, ['hash-object', '--', absolutePath]) as string).trim();
    files.set(relativePath, objectId);
  }
  return files;
}

export function compareGeneratedBundleVersionTrees(
  bundleDirectory: string,
  leftVersionId: GeneratedBundleVersionId,
  right: { versionId: GeneratedBundleVersionId } | { workingCurrentVersionId: GeneratedBundleVersionId },
): GeneratedVersionComparisonChange[] {
  const gitRoot = requireGitRoot(bundleDirectory);
  const leftTreeId = deriveSavedGenerationId(bundleDirectory, leftVersionId);
  if (!leftTreeId) throw new Error(`Version ${leftVersionId} has no saved generation to compare`);
  const leftFiles = treeFileObjectIds(gitRoot, leftTreeId);
  const rightFiles = 'versionId' in right
    ? (() => {
      const rightTreeId = deriveSavedGenerationId(bundleDirectory, right.versionId);
      if (!rightTreeId) throw new Error(`Version ${right.versionId} has no saved generation to compare`);
      return treeFileObjectIds(gitRoot, rightTreeId);
    })()
    : workingFileObjectIds(
      gitRoot,
      generatedBundleVersionDirectory(bundleDirectory, right.workingCurrentVersionId),
    );
  const paths = [...new Set([...leftFiles.keys(), ...rightFiles.keys()])].sort((left, rightPath) => left.localeCompare(rightPath));
  return paths.flatMap(relativePath => {
    const leftObjectId = leftFiles.get(relativePath);
    const rightObjectId = rightFiles.get(relativePath);
    if (leftObjectId === rightObjectId) return [];
    return [{
      status: leftObjectId === undefined ? 'added' : rightObjectId === undefined ? 'deleted' : 'modified',
      relativePath,
    } satisfies GeneratedVersionComparisonChange];
  });
}
