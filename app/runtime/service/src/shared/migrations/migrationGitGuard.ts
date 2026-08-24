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

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface MigrationGitGuard {
  gitDirectoryRealPath: string;
  gitDirectoryDevice: number;
  gitDirectoryInode: number;
  expectedHeadSha: string;
  headSource: string;
  controlPlaneDigest: string;
}

export class MigrationGitGuardError extends Error {
  constructor(detail: string) {
    super(`Migration Git protection failed: ${detail}`);
    this.name = 'MigrationGitGuardError';
  }
}

function safeGitDirectory(homePath: string): { gitPath: string; stat: fs.Stats } {
  const gitPath = path.join(homePath, '.git');
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(gitPath);
  } catch (error) {
    throw new MigrationGitGuardError(
      `the repository directory is unavailable (${error instanceof Error ? error.message : 'unknown error'})`,
    );
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new MigrationGitGuardError('.git must remain a real directory inside the Meadow Home');
  }
  return { gitPath, stat };
}

function validatedSha(source: string, label: string): string {
  const sha = source.trim();
  if (!/^[a-f0-9]{40,64}$/.test(sha)) {
    throw new MigrationGitGuardError(`${label} does not contain a valid commit SHA`);
  }
  return sha;
}

function packedRef(gitPath: string, refName: string): string | null {
  const packedRefsPath = path.join(gitPath, 'packed-refs');
  if (!fs.existsSync(packedRefsPath)) return null;
  for (const line of fs.readFileSync(packedRefsPath, 'utf8').split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith('#') || line.startsWith('^')) continue;
    const separator = line.indexOf(' ');
    if (separator < 0) continue;
    if (line.slice(separator + 1) === refName) {
      return validatedSha(line.slice(0, separator), `packed Git ref ${refName}`);
    }
  }
  return null;
}

function resolveHead(gitPath: string): { sha: string; source: string } {
  const headPath = path.join(gitPath, 'HEAD');
  const headStat = fs.lstatSync(headPath);
  if (headStat.isSymbolicLink() || !headStat.isFile()) {
    throw new MigrationGitGuardError('HEAD must remain a regular file');
  }
  const source = fs.readFileSync(headPath, 'utf8');
  const trimmed = source.trim();
  if (!trimmed.startsWith('ref:')) {
    return { sha: validatedSha(trimmed, 'detached HEAD'), source };
  }

  const refName = trimmed.slice('ref:'.length).trim();
  const segments = refName.split('/');
  if (
    !refName.startsWith('refs/')
    || path.isAbsolute(refName)
    || segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new MigrationGitGuardError('HEAD references an unsafe Git ref path');
  }
  const looseRefPath = path.join(gitPath, ...segments);
  if (fs.existsSync(looseRefPath)) {
    const refStat = fs.lstatSync(looseRefPath);
    if (refStat.isSymbolicLink() || !refStat.isFile()) {
      throw new MigrationGitGuardError(`Git ref ${refName} must remain a regular file`);
    }
    return {
      sha: validatedSha(fs.readFileSync(looseRefPath, 'utf8'), `Git ref ${refName}`),
      source,
    };
  }
  const sha = packedRef(gitPath, refName);
  if (!sha) throw new MigrationGitGuardError(`HEAD ref ${refName} is unavailable`);
  return { sha, source };
}

function controlPlaneDigest(gitPath: string): string {
  const digest = createHash('sha256');
  const walk = (directory: string, relativeDirectory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => (
      a.name.localeCompare(b.name)
    ))) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const fullPath = path.join(directory, entry.name);
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        throw new MigrationGitGuardError(`the Git control plane contains symbolic link ${relativePath}`);
      }
      digest.update(relativePath);
      digest.update('\0');
      digest.update(String(stat.mode & 0o777));
      digest.update('\0');
      if (entry.isDirectory()) {
        digest.update('directory\0');
        // Git objects can be large. HEAD resolution and the post-migration
        // commit validate the required objects without hashing the object DB.
        if (relativePath !== 'objects') walk(fullPath, relativePath);
      } else if (entry.isFile()) {
        digest.update('file\0');
        digest.update(fs.readFileSync(fullPath));
        digest.update('\0');
      } else {
        throw new MigrationGitGuardError(`the Git control plane contains special file ${relativePath}`);
      }
    }
  };
  walk(gitPath, '');
  return digest.digest('hex');
}

export function captureMigrationGitGuard(
  homePath: string,
  expectedHeadSha: string,
): MigrationGitGuard {
  const expected = validatedSha(expectedHeadSha, 'pre-migration checkpoint');
  const { gitPath, stat } = safeGitDirectory(homePath);
  const head = resolveHead(gitPath);
  if (head.sha !== expected) {
    throw new MigrationGitGuardError(
      `HEAD ${head.sha} does not match pre-migration checkpoint ${expected}`,
    );
  }
  return {
    gitDirectoryRealPath: fs.realpathSync(gitPath),
    gitDirectoryDevice: stat.dev,
    gitDirectoryInode: stat.ino,
    expectedHeadSha: expected,
    headSource: head.source,
    controlPlaneDigest: controlPlaneDigest(gitPath),
  };
}

export function assertMigrationGitGuard(homePath: string, guard: MigrationGitGuard): void {
  const current = captureMigrationGitGuard(homePath, guard.expectedHeadSha);
  if (
    current.gitDirectoryRealPath !== guard.gitDirectoryRealPath
    || current.gitDirectoryDevice !== guard.gitDirectoryDevice
    || current.gitDirectoryInode !== guard.gitDirectoryInode
  ) {
    throw new MigrationGitGuardError('the .git directory was replaced or redirected');
  }
  if (current.headSource !== guard.headSource) {
    throw new MigrationGitGuardError('HEAD was rewritten during migration');
  }
  if (current.controlPlaneDigest !== guard.controlPlaneDigest) {
    throw new MigrationGitGuardError('protected .git metadata changed during migration');
  }
}
