/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGitBranchFixture } from '../../e2e/fixtures/git-branch-fixture';
import { readGitBranches } from './gitBranches';

// Real Git processes and collection compete with the other checks in a full run.
// Give this filesystem integration test its own budget instead of the unit default.
test('branch replay uses observed ticks and preserves replaced candidates through Git collection', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'meadow-branch-test-'));
  try {
    const f = createGitBranchFixture(directory);
    f.git(['gc', '--prune=now']);
    const result = readGitBranches(directory, f.candidate);
    expect(result.heads).toEqual([null, f.first, f.second]);
    expect(result.inferredTiming).toBe(false);
    expect(result.revisions.find(revision => revision.commitHash === f.first)?.parentHash).toBe(f.accepted);
    expect(result.revisions.find(revision => revision.commitHash === f.second)?.removedFiles).toEqual(['removed.md']);
    expect(readGitBranches(directory, f.branch).heads).toEqual([null, f.accepted, f.accepted]);
    expect(f.git(['rev-parse', 'HEAD'])).toBe(f.main);
    expect(f.git(['status', '--porcelain'])).toBe('');
    expect(() => readGitBranches(directory, '--all')).toThrow('Branch not found');
    const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    manifest.ticks.forEach((tick: { gitBranchHeads?: unknown }) => { delete tick.gitBranchHeads; });
    writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    expect(readGitBranches(directory, f.candidate).inferredTiming).toBe(true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 15_000);
