/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { getFastGitOpsPath } from '../utils/configDirectory/gitUtils/gitStatusUtils.js';
import { getConfigDirectory } from '../bundle-config/bundleConfigPaths.js';

export interface SourceGitTree { commit: string; tree: string; branch: string; }
interface CapturedTree { commit: string; tree: string; files: Record<string, { digest: string; size: number; objectId: string }>; }

export class SourceCaptureChangedError extends Error {}

function run(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(getFastGitOpsPath(), args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(stderr.includes("Source files changed during capture") ? new SourceCaptureChangedError(stderr) : new Error(`Source history operation failed: ${stderr || error.message}`));
      else resolve(stdout);
    });
    child.stdin?.end(input);
  });
}

export async function storeSourceTree(source: string, files: Record<string, { digest: string; size: number }>, identity: string, parent?: string): Promise<CapturedTree & { branch: string }> {
  const home = getConfigDirectory();
  if (!fs.existsSync(path.join(home, '.git'))) await run(['init', home]);
  const branch = `refs/heads/meadow-sources/${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
  const result = JSON.parse(await run(['source-snapshot', home, source, `${branch}-candidate`, ...(parent ? ['--parent', parent] : [])], JSON.stringify(files))) as CapturedTree;
  return { ...result, branch };
}

export function retainCandidateSourceTree(snapshot: SourceGitTree): void {
  retainAcceptedSourceTree({ ...snapshot, branch: `${snapshot.branch}-candidate` });
}

export function retainAcceptedSourceTree(snapshot: SourceGitTree): void {
  execFileSync(getFastGitOpsPath(), ['accept-source-snapshot', getConfigDirectory(), snapshot.branch, snapshot.commit], { encoding: 'utf8' });
}

const readers = new Map<string, number>();

export async function withPinnedSourceTree<T>(snapshot: SourceGitTree | undefined, action: () => Promise<T>): Promise<T> {
  if (!snapshot) return await action();
  const key = path.join(cacheRoot(snapshot), snapshot.commit);
  readers.set(key, (readers.get(key) ?? 0) + 1);
  try { return await action(); }
  finally {
    const count = readers.get(key)! - 1;
    if (count) readers.set(key, count); else readers.delete(key);
  }
}

function cacheRoot(snapshot: SourceGitTree): string {
  const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 24);
  return path.join(os.tmpdir(), 'meadow-source-cache', hash(path.resolve(getConfigDirectory())), hash(snapshot.branch));
}

/** Called after bundle readers finish; only the accepted and current candidate stay expanded. */
export function pruneMaterializedSourceTrees(snapshots: SourceGitTree[]): void {
  if (!snapshots.length) return;
  const root = cacheRoot(snapshots[0]);
  if (!fs.existsSync(root)) return;
  const keep = new Set(snapshots.map(snapshot => snapshot.commit));
  for (const entry of fs.readdirSync(root)) {
    if (/^[a-f0-9]{40,64}$/.test(entry) && !keep.has(entry) && !readers.has(path.join(root, entry))) fs.rmSync(path.join(root, entry), { recursive: true, force: true });
  }
}

/** Only expanded files are disposable. Their Git trees remain rooted in source history. */
export function materializedSourceTree(snapshot: SourceGitTree): string {
  if (!/^[a-f0-9]{40,64}$/.test(snapshot.commit)) throw new Error('Invalid source commit identity');
  const root = cacheRoot(snapshot);
  const destination = path.join(root, snapshot.commit);
  if (fs.existsSync(path.join(destination, '.complete'))) return path.join(destination, 'source');
  fs.mkdirSync(root, { recursive: true });
  const temporary = path.join(root, `.capture-${randomUUID()}`);
  fs.mkdirSync(temporary);
  try {
    execFileSync(getFastGitOpsPath(), ['materialize-source-snapshot', getConfigDirectory(), snapshot.commit, path.join(temporary, 'source')], { encoding: 'utf8' });
    fs.writeFileSync(path.join(temporary, '.complete'), snapshot.commit);
    if (fs.existsSync(path.join(destination, '.complete'))) return path.join(destination, 'source');
    if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true });
    try { fs.renameSync(temporary, destination); }
    catch (error) { if (!fs.existsSync(path.join(destination, '.complete'))) throw error; }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  return path.join(destination, 'source');
}

export function readSourceBlob(snapshot: SourceGitTree, filename: string): Buffer {
  const result = JSON.parse(execFileSync(getFastGitOpsPath(), ['cat-file', getConfigDirectory(), snapshot.commit, filename], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })) as { found: boolean; data_base64?: string };
  if (!result.found || result.data_base64 === undefined) throw new Error('Captured source file is unavailable');
  return Buffer.from(result.data_base64, 'base64');
}
