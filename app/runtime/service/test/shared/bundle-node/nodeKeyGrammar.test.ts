/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';
import { createFileNodeKey, createFolderNodeKey, parseBundleNodeKey, serializeBundleNodeKey, encodedBundleNodeKey, bundleNodeKeySourceGraphPath } from '../../../../../shared_code/utils/bundleNodeKey.js';
import { Graph } from '../../../../../contracts/types/graph.js';
import { decodeWorkingGraphKeys } from '../../../src/shared/bundle-graph/workingGraphKeyCodec.js';
import type { WorkingGraphRustOutput } from '../../../src/shared/bundle-graph/workingGraphService.js';

const cases = JSON.parse(fs.readFileSync(new URL('../../../../../shared_data/bundle-node-key-conformance.json', import.meta.url), 'utf8')) as { valid: string[]; invalid: string[] };

test('TypeScript and the native adapter share one key grammar', () => {
  for (const value of cases.valid) assert.equal(serializeBundleNodeKey(parseBundleNodeKey(value)), value);
  for (const value of cases.invalid) assert.throws(() => parseBundleNodeKey(value), undefined, value);
  const root = createFolderNodeKey('');
  assert.equal(serializeBundleNodeKey(root), 'folder:');
  assert.equal(root.path, '');
  assert.ok(Object.isFrozen(root));
  const key = createFileNodeKey('Biases.md', 'source000001');
  assert.deepEqual(parseBundleNodeKey(serializeBundleNodeKey(key)), key);
  assert.equal(bundleNodeKeySourceGraphPath(key), '_mw_sources/source000001/Biases.md');
  for (const path of ['', '/Biases.md', '../Biases.md', 'Models//Biases.md']) assert.throws(() => createFileNodeKey(path));
});

test('graph lookups compare structured keys by value and reject ordinary paths', () => {
  const graph = new Graph();
  const encoded = serializeBundleNodeKey(createFileNodeKey('Biases.md'));
  graph.addNode({ bundleNodeKey: encoded, bundleNodeKind: 'file', bundleNodeName: 'Biases', label: 'A',
    sourceGraphSubdirectory: '', fileType: 'md', depth: 0, remaining_depth: 0, getIdent: () => encoded });
  assert.equal(graph.getNode(createFileNodeKey('Biases.md'))?.bundleNodeName, 'Biases');
  assert.throws(() => encodedBundleNodeKey('Biases.md'));
});

test('retained legacy snapshots migrate every graph address without changing IDs or source paths', () => {
  const old = { nodes: [{ bundleNodeKey: '/Biases.md', bundleNodeId: 'a1b2c3d4e5f6', bundleNodeKind: 'file',
    path: ['folder:', '/Biases.md'], traversal_path_steps: [{ bundleNodeKey: '/Biases.md' }],
    traversal_alternative_routes: [[{ bundleNodeKey: '/Biases.md' }]], sourceFile: { path: 'Biases.md' } }],
    edges: [{ source: 'folder:', target: '/Biases.md' }],
    allLinkResolutionMaps: { '/Biases.md': { link: { link_resolved_target_path: 'Other.md' } } },
    allInlinkSources: { '/Biases.md': ['Other.md'] }, allOutlinkTargets: { '/Biases.md': ['Other.md'] },
  } as unknown as WorkingGraphRustOutput;
  assert.throws(() => decodeWorkingGraphKeys(old));
  const migrated = decodeWorkingGraphKeys(old, true);
  assert.equal(migrated.nodes[0].bundleNodeId, 'a1b2c3d4e5f6');
  assert.equal(migrated.nodes[0].sourceFile?.path, 'Biases.md');
  assert.deepEqual(migrated.nodes[0].path, ['folder:', 'file:Biases.md']);
  assert.equal(migrated.nodes[0].traversal_path_steps?.[0].bundleNodeKey, 'file:Biases.md');
  assert.equal(migrated.nodes[0].traversal_alternative_routes?.[0][0].bundleNodeKey, 'file:Biases.md');
  assert.equal(migrated.edges[0].target, 'file:Biases.md');
  assert.deepEqual(migrated.allOutlinkTargets[encodedBundleNodeKey('file:Biases.md')], ['file:Other.md']);
  assert.deepEqual(decodeWorkingGraphKeys(migrated), migrated);
});

import { sourceFilePathToBundleNodeKey } from '../../../src/shared/bundle-node/nodeKeys.js';

test('stored Excalidraw filenames convert to their graph addresses explicitly', () => {
  assert.equal(sourceFilePathToBundleNodeKey('drawing.excalidraw.md'), 'file:drawing.excalidraw');
  assert.equal(sourceFilePathToBundleNodeKey('_mw_sources/source000001/drawing.excalidraw.md'), 'file:_mw_sources/source000001/drawing.excalidraw');
});
