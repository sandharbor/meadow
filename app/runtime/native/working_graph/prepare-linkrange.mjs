// Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const component = path.dirname(fileURLToPath(import.meta.url));
const crate = path.join(component, 'working_graph_code');
const destination = path.join(crate, 'linkrange-source');
const cacheRoot = path.join(crate, '.linkrange-cache');
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const existing = (() => { try { return lstatSync(destination); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } })();
if (existing && !existing.isSymbolicLink()) throw new Error(`Refusing to replace non-symlink ${destination}`);
let source = process.env.LINKRANGE_SOURCE_PATH;
// A deliberate local binding persists across Cargo invocations. --pinned restores
// the reproducible dependency specified by linkrange-version.json.
if (!source && existing && !process.argv.includes('--pinned')) {
  const bound = path.resolve(crate, readlinkSync(destination));
  if (!bound.startsWith(`${cacheRoot}${path.sep}`)) source = bound;
}
if (source) {
  source = realpathSync(source);
} else {
  const pin = JSON.parse(readFileSync(path.join(component, 'linkrange-version.json'), 'utf8'));
  if (!/^[a-f0-9]{40}$/.test(pin.revision)) throw new Error('Linkrange requires an exact 40-character Git revision');
  source = path.join(cacheRoot, pin.revision);
  if (!existsSync(source)) {
    mkdirSync(cacheRoot, { recursive: true });
    const staging = mkdtempSync(path.join(cacheRoot, '.fetch-'));
    try {
      git(['init', '--quiet'], staging);
      git(['fetch', '--quiet', '--depth=1', pin.repository, pin.revision], staging);
      git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], staging);
      if (git(['rev-parse', 'HEAD'], staging) !== pin.revision) throw new Error('Linkrange revision mismatch');
      try { renameSync(staging, source); } catch (error) { if (!existsSync(source)) throw error; }
    } finally { rmSync(staging, { recursive: true, force: true }); }
  }
  if (git(['rev-parse', 'HEAD'], source) !== pin.revision || git(['status', '--porcelain', '--untracked-files=no'], source)) {
    throw new Error(`Pinned Linkrange source was modified: ${source}`);
  }
}
if (!existsSync(path.join(source, 'Cargo.toml'))) throw new Error(`Linkrange Cargo.toml is missing in ${source}`);
if (!existing || path.resolve(crate, readlinkSync(destination)) !== source) {
  const temporary = `${destination}.${process.pid}.tmp`;
  try { symlinkSync(source, temporary, 'dir'); renameSync(temporary, destination); }
  finally { rmSync(temporary, { force: true }); }
}
console.log(`Linkrange source: ${source}`);
