/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { applySourceChange, listSourceChangeStatus, loadSourceChanges, materializeSourceGraph } from '../../../../shared_code/shared_dev/sourceChanges.js';

const projectRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const sourceGraph = 'meadow-test-bundles-data';
const moved = 't001/deeper/t001 ---- child 2.md';

function session(t: test.TestContext) {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-source-changes-')));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const sourceGraphsDir = path.join(temporary, 'source_graphs');
  const root = materializeSourceGraph({ projectRoot, sourceGraphsDir, sourceGraph });
  return { root, sourceGraphsDir, projectRoot, sourceGraph };
}

test('every big-graph source change applies to a clean session and leaves the canonical graph intact', t => {
  const changes = loadSourceChanges(projectRoot, sourceGraph);
  assert.ok(changes.length >= 10);
  const canonical = path.join(projectRoot, 'app/shared_data/source_graphs', sourceGraph, moved);
  const before = fs.readFileSync(canonical);
  for (const change of changes) {
    const context = session(t);
    assert.equal(listSourceChangeStatus(projectRoot, context.sourceGraphsDir, sourceGraph).find(item => item.id === change.id)?.state, 'available');
    const result = applySourceChange({ ...context, changeId: change.id });
    assert.ok(result.files.length > 0);
    assert.equal(listSourceChangeStatus(projectRoot, context.sourceGraphsDir, sourceGraph).find(item => item.id === change.id)?.state, 'applied');
    assert.throws(() => applySourceChange({ ...context, changeId: change.id }), /already applied/);
  }
  assert.deepEqual(fs.readFileSync(canonical), before);
});

test('the same session graph is reused by bundles and PageSpec metadata stays out of runtime source bytes', t => {
  const context = session(t);
  assert.doesNotMatch(fs.readFileSync(path.join(context.root, moved), 'utf8'), /pagespecs:/);
  applySourceChange({ ...context, changeId: 'move-nested-page' });
  assert.equal(materializeSourceGraph(context), context.root);
  assert.equal(fs.existsSync(path.join(context.root, moved)), false);
});

test('preflight catches conflicting edits before any part of a multi-file change is applied', t => {
  const context = session(t);
  const link = path.join(context.root, 't003 - link to section.md');
  fs.appendFileSync(link, '\nAn independent edit.');
  assert.throws(() => applySourceChange({ ...context, changeId: 'rename-page-with-links' }), /starting files/);
  assert.equal(fs.existsSync(path.join(context.root, 't003 ---- page with section to link to.md')), true);
  assert.equal(fs.existsSync(path.join(context.root, 't003 ---- renamed section page.md')), false);
});

test('a conflicting destination and a symlink cannot overwrite unrelated files', t => {
  const context = session(t);
  const elsewhere = path.join(path.dirname(context.sourceGraphsDir), 'elsewhere');
  fs.mkdirSync(elsewhere);
  fs.symlinkSync(elsewhere, path.join(context.root, 'source-changes'));
  assert.throws(() => applySourceChange({ ...context, changeId: 'move-nested-page' }), /symlink/);
  assert.equal(fs.existsSync(path.join(context.root, moved)), true);
  assert.deepEqual(fs.readdirSync(elsewhere), []);
});

test('the executor rejects the canonical source graph and unknown changes', t => {
  assert.throws(() => applySourceChange({ projectRoot, sourceGraph, sourceGraphsDir: path.join(projectRoot, 'app/shared_data/source_graphs'), changeId: 'delete-nested-page' }), /isolated session/);
  const context = session(t);
  assert.throws(() => applySourceChange({ ...context, changeId: '../not-a-change' }), /Unknown source change/);
});

test('independent changes compose while overlapping changes report their conflict', t => {
  const context = session(t);
  applySourceChange({ ...context, changeId: 'move-nested-page' });
  applySourceChange({ ...context, changeId: 'delete-linked-section' });
  const status = listSourceChangeStatus(projectRoot, context.sourceGraphsDir, sourceGraph);
  assert.equal(status.find(item => item.id === 'move-nested-page')?.state, 'applied');
  assert.equal(status.find(item => item.id === 'delete-nested-page')?.state, 'conflict');
  assert.equal(status.find(item => item.id === 'delete-linked-section')?.state, 'applied');
});
