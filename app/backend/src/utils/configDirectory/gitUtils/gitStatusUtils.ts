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
import { exec, execFile } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { loadAppConfig, getDefaultConfigDirectory } from '../../../../../shared_code/utils/appConfigUtils.js';
import { createLogger } from '../../logging/backendLoggingUtils.js';
import { notifyGitOperation } from './gitOperationTracker.js';
import { resolveNativeRustBinaryPath } from '../../../../../shared_code/utils/nativeRustBinaryPath.js';

interface NativeGitFileStatus {
  path: string;
  status: string;
}

interface CommitChangesResult {
  success: boolean;
  sha: string | null;
  files_committed: number;
  message: string | null;
}

export interface DirLogCommit {
  sha: string;
  parent_sha: string | null;
  subject: string;
  author_name: string;
  author_time: number; // seconds since unix epoch
  files_changed_count: number;
}

export interface DirLogResult {
  commits: DirLogCommit[];
}

export interface CommitFileEntry {
  path: string; // repo-relative path
  status: 'A' | 'M' | 'D';
}

export interface CommitFilesResult {
  sha: string;
  parent_sha: string | null;
  files: CommitFileEntry[];
}

export interface CatFileResult {
  found: boolean;
  kind: 'blob' | 'blob-exec' | 'link' | 'tree' | 'commit' | null;
  data_base64: string | null;
}

export interface FileLogCommit {
  sha: string;
  parent_sha: string | null;
  subject: string;
  author_name: string;
  author_time: number; // seconds since unix epoch
}

export interface FileLogResult {
  commits: FileLogCommit[];
}

export interface HtmlSectionChanges {
  head: boolean;
  header: boolean;
  main: boolean;
  footer: boolean;
}

export interface HtmlSectionDiffFile {
  path: string; // absolute path
  repo_path: string; // repo-relative path
  status: 'A' | 'M' | 'D';
  sections: HtmlSectionChanges;
}

export interface HtmlSectionDiffResult {
  files: HtmlSectionDiffFile[];
}

/**
 * Gets the fast_git_ops binary path, checking environment variable first then falling back to relative path.
 * Used by various parts of the backend that need fast git operations.
 */
export function getFastGitOpsPath(): string {
  return resolveNativeRustBinaryPath({
    importMetaUrl: import.meta.url,
    upLevelsToApp: 5,
    cratePathSegments: ['fast_git_ops', 'fast_git_ops_code'],
    binaryName: 'fast_git_ops_bin',
    envVar: 'FAST_GIT_OPS_PATH'
  });
}

/**
 * Runs the native fast_git_ops status command on a directory and returns the raw JSON string.
 * The binary uses gitoxide for fast git status checks.
 */
export async function runGitStatusRaw(directory: string): Promise<string> {
  const command = `"${getFastGitOpsPath()}" status "${directory}"`;

  return new Promise<string>((resolve, reject) => {
    exec(command, { timeout: 30000, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const unknownErr: unknown = error;
        const msg =
          unknownErr && typeof unknownErr === 'object' && 'message' in unknownErr
            ? String((unknownErr as { message?: unknown }).message)
            : typeof unknownErr === 'string'
              ? unknownErr
              : (() => {
                  try {
                    return JSON.stringify(unknownErr);
                  } catch {
                    return 'Unknown error';
                  }
                })();
        return reject(new Error(msg));
      }
      if (stderr && stderr.length > 0 && !stdout) return reject(new Error(stderr));
      resolve(stdout);
    });
  });
}

async function runFastGitOpsJson(args: string[], timeoutMs = 30000, maxBufferBytes = 50 * 1024 * 1024): Promise<string> {
  const binaryPath = getFastGitOpsPath();
  return new Promise<string>((resolve, reject) => {
    execFile(binaryPath, args, { timeout: timeoutMs, maxBuffer: maxBufferBytes }, (error, stdout, stderr) => {
      if (error) {
        const unknownErr: unknown = error;
        const msg =
          unknownErr && typeof unknownErr === 'object' && 'message' in unknownErr
            ? String((unknownErr as { message?: unknown }).message)
            : typeof unknownErr === 'string'
              ? unknownErr
              : (() => {
                  try {
                    return JSON.stringify(unknownErr);
                  } catch {
                    return 'Unknown error';
                  }
                })();
        return reject(new Error(`${msg} | stderr: ${stderr || '(none)'} | stdout: ${stdout?.slice(0, 200) || '(none)'}`));
      }
      if (stderr && stderr.length > 0 && !stdout) return reject(new Error(stderr));
      resolve(stdout);
    });
  });
}

/**
 * Spawn fast_git_ops_bin and retry briefly on .git/index lock contention.
 * gix writes the index with `Fail::Immediately`, so when two commit
 * subprocesses race (e.g. a config-change commit firing alongside a preview
 * regeneration commit) one fails with `AcquireLock(PermanentlyLocked ...)`.
 * The lock holder is another commit that finishes in tens of ms, so a few
 * short backoffs reliably get us through.
 */
async function spawnFastGitOpsWithLockRetry(
  binaryPath: string,
  args: string[],
  timeoutMs: number,
  maxBufferBytes: number,
): Promise<string> {
  const MAX_ATTEMPTS = 8;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await new Promise<string>((resolve, reject) => {
        execFile(binaryPath, args, { timeout: timeoutMs, maxBuffer: maxBufferBytes, encoding: 'utf8' }, (error, stdout, stderr) => {
          if (error) {
            const e = error as NodeJS.ErrnoException & { stderr?: string };
            const combined = `${stderr ?? ''}\n${e.message ?? ''}`;
            const lockErr = new Error(combined) as Error & { isLockContention?: boolean };
            if (combined.includes('PermanentlyLocked') || combined.includes('AcquireLock')) {
              lockErr.isLockContention = true;
            }
            return reject(lockErr);
          }
          resolve(stdout);
        });
      });
    } catch (err) {
      lastErr = err;
      const isLockContention = (err as { isLockContention?: boolean }).isLockContention === true;
      if (!isLockContention || attempt >= MAX_ATTEMPTS - 1) throw err;
      await delay(25 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('spawnFastGitOpsWithLockRetry exhausted retries');
}

/**
 * Runs the native fast_git_ops status command on a directory and returns a Map of file paths to status.
 * Uses the native fast_git_ops binary for fast git status checks.
 *
 * Status values: 'new', 'modified', 'deleted'
 *
 * @param directory - The directory to check git status in (must be within a git repository)
 * @returns Map where keys are full file paths and values are status strings
 */
export async function runGitStatusNative(directory: string): Promise<Map<string, string>> {
  const statusMap = new Map<string, string>();

  const output = await runGitStatusRaw(directory);
  const results = JSON.parse(output) as NativeGitFileStatus[];

  for (const { path: filePath, status } of results) {
    statusMap.set(filePath, status);
  }

  return statusMap;
}

/**
 * Logs a message to both console and meadow.log
 */
export function logWithFile(_configDir: string, message: string): void {
  const logger = createLogger();
  logger.info(message);
}

/**
 * Logs an error message to both console.error and meadow.log
 */
export function logErrorWithFile(_configDir: string, message: string): void {
  const logger = createLogger();
  logger.error(message);
}

/**
 * Commits changes in multiple directories as a single commit using the native fast_git_ops binary.
 * Uses the native fast_git_ops binary for fast commits.
 * Automatically ensures the git repository is initialized before committing.
 *
 * @param directories - Array of directory paths to commit (all must be within the same git repository)
 * @param message - The commit message
 * @param options.configDir - Optional config directory for loading app config
 * @param options.manageGitAutomatically - Override for automatic git management setting
 * @param options.allowEmpty - If true, create a commit even if there are no changes
 * @returns The commit SHA if changes were committed, null if no changes (unless allowEmpty)
 */
export async function commitChangesNative(
  directories: string[],
  message: string,
  options?: { configDir?: string; manageGitAutomatically?: boolean; allowEmpty?: boolean }
): Promise<string | null> {
  // Notify that a git operation is starting
  notifyGitOperation();

  const configDir = options?.configDir || getDefaultConfigDirectory();

  const manageGitAutomatically =
    typeof options?.manageGitAutomatically === 'boolean'
      ? options.manageGitAutomatically
      : loadAppConfig(configDir).manageGitAutomatically !== false;

  if (!manageGitAutomatically) {
    const skipMsg = `[commitChangesNative] manageGitAutomatically=false; skipping automatic git commit. Would have committed directories: ${directories.join(
      ', '
    )} (message="${message}")`;
    logWithFile(configDir, skipMsg);
    return null;
  }

  // Ensure git repo is initialized before attempting commit
  const gitDir = path.join(configDir, '.git');
  if (!fs.existsSync(gitDir)) {
    logWithFile(configDir, `[commitChangesNative] Git repo not found, auto-initializing before commit...`);
    await runGitInitNative(configDir);
  }

  const binaryPath = getFastGitOpsPath();

  // Build command arguments
  const args = [
    'commit-changes',
    ...directories,
    '-m', message,
    '-n', 'Meadow',
    '-e', 'meadow@local'
  ];

  if (options?.allowEmpty) {
    args.push('--allow-empty');
  }

  logWithFile(configDir, `[commitChangesNative] Committing to directories: ${directories.join(', ')} (message="${message}"${options?.allowEmpty ? ', allowEmpty=true' : ''})`);

  const output = await spawnFastGitOpsWithLockRetry(
    binaryPath,
    args,
    60000, // 60 second timeout
    10 * 1024 * 1024, // 10MB buffer
  );

  const result = JSON.parse(output) as CommitChangesResult;

  if (!result.success) {
    throw new Error(result.message || 'Failed to commit changes');
  }

  if (result.sha) {
    logWithFile(configDir, `[commitChangesNative] Created commit ${result.sha.slice(0, 7)}: ${message}`);
  } else {
    logWithFile(configDir, `[commitChangesNative] No changes to commit`);
  }

  return result.sha;
}

export async function runGitDirLogNative(directory: string, limit = 50): Promise<DirLogResult> {
  const output = await runFastGitOpsJson(['dir-log', directory, '--limit', String(limit)]);
  return JSON.parse(output) as DirLogResult;
}

export async function runGitCommitFilesNative(directory: string, sha: string): Promise<CommitFilesResult> {
  const output = await runFastGitOpsJson(['commit-files', directory, sha]);
  return JSON.parse(output) as CommitFilesResult;
}

export async function runGitCatFileNative(directory: string, sha: string, repoRelativePath: string): Promise<CatFileResult> {
  const output = await runFastGitOpsJson(['cat-file', directory, sha, repoRelativePath], 30000, 50 * 1024 * 1024);
  const parsed = JSON.parse(output) as { found: boolean; kind?: string; data_base64?: string };
  return {
    found: parsed.found === true,
    kind: (parsed.kind ?? null) as CatFileResult['kind'],
    data_base64: parsed.data_base64 ?? null,
  };
}

export async function runGitFileLogNative(directory: string, repoRelativePath: string, limit = 50): Promise<FileLogResult> {
  const output = await runFastGitOpsJson(['file-log', directory, repoRelativePath, '--limit', String(limit)]);
  return JSON.parse(output) as FileLogResult;
}

export interface InitResult {
  success: boolean;
  already_existed: boolean;
  message: string | null;
}

export async function runGitInitNative(directory: string, defaultBranch = 'main'): Promise<InitResult> {
  const output = await runFastGitOpsJson(['init', directory, '--default-branch', defaultBranch]);
  return JSON.parse(output) as InitResult;
}

export async function runGitHtmlSectionDiffNative(directory: string, sha?: string): Promise<HtmlSectionDiffResult> {
  const args = ['html-section-diff', directory];
  if (sha) {
    args.push('--sha', sha);
  }
  // Larger buffer: JSON for many files can be big.
  const output = await runFastGitOpsJson(args, 60000, 200 * 1024 * 1024);
  return JSON.parse(output) as HtmlSectionDiffResult;
}
