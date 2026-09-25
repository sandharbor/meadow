/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { collectReferencedSourceChanges, describeTestSourceChanges, extractSourceChangeReferences } from '../../src/artifacts/testSourceChanges.js';

test('source-change references ignore comments and strings, preserving repeated and multiline calls', () => {
  const source = [
    '// sourceChanges.apply("fake-comment");',
    '`sourceChanges.apply("fake-string")`;',
    "await sourceChanges.apply('move-page');",
    'await sourceChanges.apply(',
    '  `move-page`, "other-graph",',
    ');',
    'await sourceChanges.apply(dynamicId);',
    'await somethingElse.apply("move-page");',
  ].join('\n');
  assert.deepEqual(extractSourceChangeReferences(source), [
    { id: 'move-page', line: 2 }, { id: 'move-page', sourceGraph: 'other-graph', line: 5 },
  ]);
});

test('captured definitions survive checkout changes and graph ambiguity never selects the wrong definition', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'source-change-definitions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writeDefinition = (graph: string, action: string) => {
    const dir = path.join(root, 'app/shared_data/source_changes', graph, 'move-page');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'change.yaml'), JSON.stringify({ id: 'move-page', label: 'Move a page', action,
      check: 'Its identity survives.', e2e: 'move-page.spec.ts', categories: ['move'], sourceGraph: graph,
      operations: [{ move: { from: 'before.md', to: 'after.md' } }],
    }));
  };
  const source = "await sourceChanges.apply('move-page');";
  writeDefinition('first-graph', 'Original action');
  const captured = collectReferencedSourceChanges(source, root);
  assert.equal(captured.length, 1);
  writeDefinition('first-graph', 'Edited later');
  assert.equal(collectReferencedSourceChanges(source, root)[0].action, 'Edited later');
  assert.equal(describeTestSourceChanges(source, captured)[0].definition?.action, 'Original action');
  assert.equal(describeTestSourceChanges(source, captured)[0].origin, 'run');
  assert.equal(describeTestSourceChanges(source, [])[0].definition, null);
  writeDefinition('second-graph', 'Another graph');
  assert.deepEqual(collectReferencedSourceChanges(source, root), []);
  assert.equal(collectReferencedSourceChanges("sourceChanges.apply('move-page', 'second-graph')", root)[0].action, 'Another graph');
});
