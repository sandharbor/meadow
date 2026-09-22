/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { fixtureSourceLocations, loadSourceChanges } from '../../../../shared_code/shared_dev/sourceChanges.js';
import { displaySourceChangeOperations } from '../client/components/sourceChangePresentation.js';

const projectRoot = fileURLToPath(new URL('../../../../../', import.meta.url));

test('the competing move example displays registered source names without changing executable operations', () => {
  const changes = loadSourceChanges(projectRoot, 'multi-source');
  const change = changes.find(change => change.id === 'competing-cross-source-moves')!;
  const original = JSON.stringify(change.operations);
  const locations = fixtureSourceLocations(projectRoot, 'home_fixture_multi_source');
  assert.deepEqual(change.categories, ['move', 'add', 'remove']);
  assert.ok(!changes.some(change => change.categories[0] === 'add'));
  assert.deepEqual(displaySourceChangeOperations(change, locations), [
    { delete: 'notes://Same/Inside.md' },
    { write: { path: 'research://Moved/Inside.md', contentFile: 'Inside.md' } },
    { write: { path: 'reference://Moved/Inside.md', contentFile: 'Inside.md' } },
    { replaceText: { path: 'notes://Start.md', before: '[[Same/Inside]]', after: '[[Moved/Inside::research]] and [[Moved/Inside::reference]]', count: 1 } },
  ]);
  assert.equal(JSON.stringify(change.operations), original);
});

test('source roots use canonical names while unregistered relocation targets remain filesystem paths', () => {
  const locations = [{ graph: 'multi-source', subdirectory: 'research', name: 'papers' }];
  assert.deepEqual(displaySourceChangeOperations({ sourceGraph: 'multi-source', operations: [
    { move: { from: 'research', to: 'research-relocated' } },
    { delete: 'research/Archive/Page.md' },
  ] }, locations), [
    { move: { from: 'papers://', to: 'research-relocated' } },
    { delete: 'papers://Archive/Page.md' },
  ]);
});

test('single-source relative paths and replacement text are preserved', () => {
  const change = { sourceGraph: 'single', operations: [
    { replaceText: { path: 'notes/Page.md', before: 'notes/Page.md', after: 'research/Page.md', count: 1 } },
  ] };
  assert.deepEqual(displaySourceChangeOperations(change, [{ graph: 'multi-source', subdirectory: 'notes', name: 'notes' }]), change.operations);
  assert.deepEqual(displaySourceChangeOperations(change, [{ graph: 'single', subdirectory: 'notes', name: 'notebook' }]), [
    { replaceText: { path: 'notebook://Page.md', before: 'notes/Page.md', after: 'research/Page.md', count: 1 } },
  ]);
});
