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

import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import { dirname, join, relative } from 'path';

/**
 * Recursively delete the contents of a directory but leave the directory
 * itself in place. No-op if the directory doesn't exist.
 */
export function clearDirectory(dir: string): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      clearDirectory(fullPath);
      fs.rmdirSync(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
}

/**
 * Recursively copy a directory's contents to a destination, creating the
 * destination directory if it doesn't already exist.
 */
export function copyDirectory(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const pendingRemovals = new Set<Promise<void>>();
let discardedCount = 0;

/**
 * Remove a directory as `fs.rmSync(dir, { recursive: true, force: true })`
 * does, without waiting for the deletion: the directory is moved aside at
 * once, freeing its path, and deleted in the background. A directory that
 * cannot be moved aside is removed before returning.
 */
export function discardDirectory(dir: string): void {
  if (!fs.existsSync(dir)) return;
  const aside = join(os.tmpdir(), `meadow-discarded-${process.pid}-${Date.now()}-${discardedCount++}`);
  try {
    fs.renameSync(dir, aside);
  } catch {
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  }
  const removal: Promise<void> = fs.promises.rm(aside, { recursive: true, force: true })
    .catch(() => undefined)
    .finally(() => pendingRemovals.delete(removal));
  pendingRemovals.add(removal);
}

/** Wait until every directory discarded so far has been deleted. */
export async function finishDiscardedDirectories(): Promise<void> {
  await Promise.all(pendingRemovals);
}

function fileStamp(stats: fs.BigIntStats): string {
  return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`;
}

// Destination → the stamps of a copy's source and destination just after it.
const copies = new Map<string, string>();
const MAX_REMEMBERED_COPIES = 10_000;

function copyStamp(source: string, destination: string): string {
  return `${fileStamp(fs.statSync(source, { bigint: true }))}|${fileStamp(fs.statSync(destination, { bigint: true }))}`;
}

/**
 * Copy a file as `fs.copyFileSync` does, unless the destination is still the
 * copy this function last made of the unchanged source, as when a page embeds
 * an image that an earlier page already copied.
 */
export function copyFileUnlessCurrent(source: string, destination: string): void {
  const previous = copies.get(destination);
  if (previous !== undefined) {
    try {
      if (copyStamp(source, destination) === previous) return;
    } catch {
      // Copy again below, which reports a missing source as it always has.
    }
  }
  fs.copyFileSync(source, destination);
  copies.delete(destination);
  if (copies.size >= MAX_REMEMBERED_COPIES) copies.delete(copies.keys().next().value!);
  copies.set(destination, copyStamp(source, destination));
}

function existingEntry(file: string): fs.BigIntStats | undefined {
  try {
    return fs.lstatSync(file, { bigint: true });
  } catch {
    return undefined;
  }
}

function sameBytes(file: string, size: number, bytes: () => Buffer): boolean {
  return size === fs.statSync(file).size && fs.readFileSync(file).equals(bytes());
}

// File → its stamp and a digest of what it holds, recorded when a rebuild
// last wrote or compared it. While the stamp is unchanged, so is the file.
const knownContents = new Map<string, string>();
const MAX_KNOWN_CONTENTS = 50_000;

function rememberContents(file: string, digest: string): void {
  knownContents.delete(file);
  if (knownContents.size >= MAX_KNOWN_CONTENTS) knownContents.delete(knownContents.keys().next().value!);
  knownContents.set(file, `${fileStamp(fs.lstatSync(file, { bigint: true }))}|${digest}`);
}

/**
 * Rebuilds a directory to hold exactly the files and directories written
 * through it, as removing and recreating it would, except that a file whose
 * bytes and mode are unchanged is left untouched. Its timestamps and inode
 * stay the same, so indexes that recognise unchanged files by their stamps
 * remain valid. `finish` removes everything that was not written again.
 */
export class DirectoryRebuild {
  private readonly previous: string[] = [];
  private readonly written = new Set<string>(['']);
  private readonly writeMode = 0o666 & ~process.umask();

  constructor(readonly root: string) {
    const entry = existingEntry(root);
    if (entry && !entry.isDirectory()) fs.rmSync(root, { recursive: true, force: true });
    if (entry?.isDirectory()) {
      for (const name of fs.readdirSync(root, { recursive: true })) this.previous.push(String(name));
    }
    fs.mkdirSync(root, { recursive: true });
  }

  private relative(file: string): string {
    return relative(this.root, file);
  }

  /** Make way for a new entry at `file`, unless it already holds what `keep` accepts. */
  private replace(file: string, keep: (entry: fs.BigIntStats) => boolean): boolean {
    const entry = existingEntry(file);
    if (entry && keep(entry)) return false;
    if (entry) fs.rmSync(file, { recursive: true, force: true });
    return true;
  }

  /** Keep `file` if it is a file with `mode` holding the bytes `digest` names; otherwise create it with `write`. */
  private keepOrWrite(file: string, mode: bigint, digest: string, sameBytesAs: (file: string) => boolean, write: () => void): void {
    this.mkdir(dirname(file));
    const keep = (entry: fs.BigIntStats) => entry.isFile() && (entry.mode & 0o7777n) === mode
      && (knownContents.get(file) === `${fileStamp(entry)}|${digest}` || sameBytesAs(file));
    if (this.replace(file, keep)) write();
    rememberContents(file, digest);
    this.written.add(this.relative(file));
  }

  mkdir(directory: string): void {
    const name = this.relative(directory);
    if (this.written.has(name)) return;
    this.mkdir(dirname(directory));
    if (this.replace(directory, entry => entry.isDirectory())) fs.mkdirSync(directory);
    this.written.add(name);
  }

  writeFile(file: string, content: string): void {
    this.writeFileWith(file, content, this.writeMode, () => fs.writeFileSync(file, content));
  }

  /** Keep `file` if it holds `content` with `mode`; otherwise create it with `write`. */
  writeFileWith(file: string, content: string, mode: number, write: () => void): void {
    const digest = createHash('sha256').update(content).digest('hex');
    this.keepOrWrite(file, BigInt(mode), digest,
      existing => sameBytes(existing, Buffer.byteLength(content), () => Buffer.from(content)), write);
  }

  copyFile(source: string, file: string): void {
    const sourceEntry = fs.statSync(source, { bigint: true });
    this.keepOrWrite(file, sourceEntry.mode & 0o7777n, `copy of ${fileStamp(sourceEntry)}`,
      existing => sameBytes(existing, Number(sourceEntry.size), () => fs.readFileSync(source)),
      () => fs.copyFileSync(source, file));
  }

  /** Copy an entry that is neither a file nor a directory, as `fs.cpSync` does. */
  copyOther(source: string, file: string): void {
    this.mkdir(dirname(file));
    fs.rmSync(file, { recursive: true, force: true });
    fs.cpSync(source, file, { recursive: true });
    this.written.add(this.relative(file));
  }

  /** Remove each previous entry that was not written again. */
  finish(): void {
    for (const name of this.previous) {
      // A directory that was not written again holds nothing that was.
      const parent = dirname(name) === '.' ? '' : dirname(name);
      if (!this.written.has(name) && this.written.has(parent) && existingEntry(join(this.root, name))) {
        fs.rmSync(join(this.root, name), { recursive: true, force: true });
      }
    }
  }
}
