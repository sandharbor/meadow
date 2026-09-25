/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { latestSourceChangeRuns } from './sourceChangeReports.js';

test('each source change links its latest assembled scenario, including failures and changed titles', t => {
  const artifactsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'source-change-reports-'));
  t.after(() => fs.rmSync(artifactsRoot, { recursive: true, force: true }));
  const add = (run: string, slug: string, spec: string, title: string, status = 'passed', assembled = true) => {
    const dir = path.join(artifactsRoot, run, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'test-file.txt'), `/another/checkout/app/acceptance/e2e/tests/${spec}`);
    fs.writeFileSync(path.join(dir, 'status.txt'), status);
    if (assembled) fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ testName: title }));
  };
  add('2026-09-20_10-00-00', 'move-old', 'move.spec.ts', 'Old move title');
  add('2026-09-20_10-00-00', 'add', 'add.spec.ts', 'Add a page');
  add('2026-09-21_10-00-00', 'move-new', 'move.spec.ts', 'New move title', 'failed');
  add('2026-09-22_10-00-00', 'unrelated', 'other.spec.ts', 'Unrelated newer run');
  add('2026-09-22_11-00-00', 'move-new', 'move.spec.ts', 'Unassembled run', 'running', false);
  const movedDirectory = path.join(artifactsRoot, '2026-09-21_10-00-00/move-new');
  fs.writeFileSync(path.join(movedDirectory, 'report-meta.json'), JSON.stringify({ scenarioInfo: { testName: 'move-new' } }));
  fs.writeFileSync(path.join(movedDirectory, 'manifest.json'), JSON.stringify({ testName: 'move-new', testSource: "test('New move title', async () => {});" }));
  const runs = latestSourceChangeRuns(['move.spec.ts', 'add.spec.ts', 'missing.spec.ts'], { artifactsRoot, viewerUrl: 'http://localhost:9876/' });
  assert.deepEqual(runs.get('move.spec.ts'), { runId: '2026-09-21_10-00-00', scenario: 'New move title', slug: 'move-new', url: 'http://localhost:9876/2026-09-21_10-00-00/move-new' });
  assert.equal(runs.get('add.spec.ts')?.runId, '2026-09-20_10-00-00');
  assert.equal(runs.has('missing.spec.ts'), false);
  assert.equal(latestSourceChangeRuns(['move.spec.ts'], { artifactsRoot: path.join(artifactsRoot, 'absent') }).size, 0);
});
