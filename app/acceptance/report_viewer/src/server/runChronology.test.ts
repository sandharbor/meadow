/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { afterEach, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runsNewestFirst } from './runChronology.js';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

function artifacts() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'run-chronology-'));
  directories.push(root);
  return root;
}

function scenario(root: string, runId: string, slug: string, startTime: string) {
  const directory = path.join(root, runId, slug);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ startTime }));
}

test('dated runs and report-viewer fixtures sort by start time, independent of their names', () => {
  const root = artifacts();
  scenario(root, 'rv-fixture-old', 'recording', '2026-10-01T12:00:00Z');
  scenario(root, 'rv-fixture-between', 'late-scenario', '2026-10-04T15:00:00Z');
  scenario(root, 'rv-fixture-between', 'early-scenario', '2026-10-04T12:00:00Z');
  scenario(root, 'rv-fixture-between', 'invalid-scenario', 'invalid');
  scenario(root, '2026-10-05_10-00-00', 'recording', '2026-10-05T18:00:00Z');
  scenario(root, '2026-10-03_10-00-00_agent', 'recording', '2026-10-06T18:00:00Z');
  mkdirSync(path.join(root, '__internal'));
  writeFileSync(path.join(root, 'notes.txt'), 'not a run');
  const runs = runsNewestFirst(root);
  expect(runs.map(run => run.runId)).toEqual(['2026-10-05_10-00-00', 'rv-fixture-between', '2026-10-03_10-00-00_agent', 'rv-fixture-old']);
  expect(runs.find(run => run.runId === 'rv-fixture-between')?.createdAt).toBe('2026-10-04T12:00:00.000Z');
});

test('incomplete runs use their directory creation time, which later edits do not change', () => {
  const root = artifacts();
  const directory = path.join(root, 'rv-incomplete');
  mkdirSync(directory);
  const stats = statSync(directory);
  const created = stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.mtimeMs;
  mkdirSync(path.join(root, '2000-01-01_00-00-00'));
  mkdirSync(path.join(root, '2099-01-01_00-00-00'));
  if (stats.birthtimeMs > 0) utimesSync(directory, new Date(), new Date('2100-01-01T00:00:00Z'));
  const runs = runsNewestFirst(root);
  expect(runs.map(run => run.runId)).toEqual(['2099-01-01_00-00-00', 'rv-incomplete', '2000-01-01_00-00-00']);
  expect(runs[1].createdAt).toBe(new Date(created).toISOString());
});
