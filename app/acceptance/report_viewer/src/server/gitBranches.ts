/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface Tick { timestamp: string; gitBranchHeads?: Record<string, string> }
export interface BranchRevision {
  timestamp: string; commitHash: string; commitMessage: string; parentHash?: string;
  files: string[]; changedFiles: string[]; removedFiles: string[];
}

/** Branch observations use the same tick indices as the working-tree recording. */
export function readGitBranches(scenarioDirectory: string, branch?: string) {
  const cwd = path.join(scenarioDirectory, 'meadowHome-state-repo');
  if (!existsSync(path.join(cwd, '.git'))) return { branches: [], defaultBranch: '', revisions: [], heads: [], inferredTiming: false };
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const manifestPath = path.join(scenarioDirectory, 'manifest.json');
  const ticks: Tick[] = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).ticks ?? [] : [];
  const branches = [...new Set([...git('for-each-ref', '--format=%(refname)', 'refs/heads/').trim().split('\n').filter(Boolean), ...ticks.flatMap(tick => Object.keys(tick.gitBranchHeads ?? {}))])].sort();
  const defaultBranch = git('symbolic-ref', 'HEAD').trim();
  if (!branch) return { branches, defaultBranch, revisions: [], heads: [], inferredTiming: false };
  if (!branches.includes(branch)) throw new Error('Branch not found');
  const exactTiming = ticks.some(tick => tick.gitBranchHeads !== undefined);
  const observed = ticks.flatMap(tick => tick.gitBranchHeads?.[branch] ? [tick.gitBranchHeads[branch]] : []);
  let reachable: string[] = [];
  try { reachable = git('rev-list', '--reverse', branch, '--').trim().split('\n').filter(Boolean); }
  catch { if (!observed.length) throw new Error('Branch history unavailable'); }
  const revisions: BranchRevision[] = [...new Set([...reachable, ...observed])].map(commitHash => {
    if (!/^[a-f0-9]{40,64}$/.test(commitHash)) throw new Error('Invalid captured commit');
    const [timestamp, commitMessage, parents] = git('show', '-s', '--format=%aI%n%s%n%P', commitHash, '--').trim().split('\n');
    const parentHash = parents?.split(' ')[0];
    const files = git('ls-tree', '-r', '--name-only', '-z', commitHash).split('\0').filter(Boolean);
    const changedFiles = git('diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', ...(parentHash ? [parentHash] : []), commitHash, '--').split('\0').filter(Boolean);
    const present = new Set(files);
    return { timestamp, commitHash, commitMessage, parentHash, files, changedFiles, removedFiles: changedFiles.filter(file => !present.has(file)) };
  }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const heads = ticks.map(tick => exactTiming ? tick.gitBranchHeads?.[branch] ?? null : revisions.filter(revision => new Date(revision.timestamp).getTime() <= new Date(tick.timestamp).getTime()).at(-1)?.commitHash ?? null);
  return { branches, defaultBranch, revisions, heads, inferredTiming: !exactTiming };
}
