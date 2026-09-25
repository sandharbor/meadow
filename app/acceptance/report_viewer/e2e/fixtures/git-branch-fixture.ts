/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Small actual Git history with two candidates sharing a parent and a deleted file. */
export function createGitBranchFixture(directory: string) {
  const cwd = path.join(directory, 'meadowHome-state-repo');
  mkdirSync(cwd, { recursive: true });
  const git = (args: string[], input?: string) => execFileSync('git', args, { cwd, input, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.name', 'Meadow Test']); git(['config', 'user.email', 'test@local']);
  writeFileSync(path.join(cwd, 'home.txt'), 'normal working tree');
  git(['add', '.']); git(['commit', '-qm', 'Home initialized']);
  const main = git(['rev-parse', 'HEAD']);
  const commit = (content: string, message: string, parent?: string, extra = false) => {
    const blob = git(['hash-object', '-w', '--stdin'], content);
    const tree = git(['mktree'], `100644 blob ${blob}\tpage.md\n${extra ? `100644 blob ${blob}\tremoved.md\n` : ''}`);
    return git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message]);
  };
  const accepted = commit('before\n', 'Accepted source', undefined, true);
  const first = commit('first candidate\n', 'First candidate', accepted);
  const second = commit('second candidate\n', 'Second candidate', accepted);
  const branch = 'refs/heads/meadow-sources/example';
  const candidate = `${branch}-candidate`;
  git(['update-ref', branch, accepted]); git(['update-ref', candidate, second]);
  git(['update-ref', `refs/meadow-e2e/observed/${first}`, first]);
  const start = Date.now() + 2000;
  const ticks = [null, first, second].map((head, tickIndex) => ({
    timestamp: new Date(start + tickIndex * 1000).toISOString(), tickIndex, isCheckpoint: true,
    checkpointMessage: ['Before sourcing', 'First candidate observed', 'Candidate replaced'][tickIndex],
    gitHeadSha: main, gitBranchHeads: { 'refs/heads/main': main, ...(head ? { [branch]: accepted, [candidate]: head } : {}) },
    fileCount: 1, uncommittedCount: 0, uncommittedFiles: [], uncommittedFileContents: {}, ignoredFiles: [],
    addedFiles: [], removedFiles: [], changedUncommitted: false, changedGitHead: tickIndex === 0,
    s3KeyCount: 0, s3AddedKeys: [], s3ModifiedKeys: [], s3RemovedKeys: [], s3Changed: false,
  }));
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ testName: 'Git branch replay', startTime: ticks[0].timestamp, endTime: ticks[2].timestamp,
    logs: [], ticks, tickFileListing: { 0: ['home.txt'], 1: ['home.txt'], 2: ['home.txt'] }, conceptIds: [], appAreaDocIds: [] }));
  writeFileSync(path.join(directory, 'status.txt'), 'passed');
  return { branch, candidate, accepted, first, second, main, cwd, git };
}
