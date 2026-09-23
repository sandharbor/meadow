/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { expect } from '@playwright/test';
import YAML from 'yaml';
import { MeadowHomeBundleConfig } from '../../src/run/utils/MeadowHomeBundleConfig.js';

function fixture(t: TestContext) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-bundle-config-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const directory = path.join(home, 'bundles', 'example', 'config');
  fs.mkdirSync(directory, { recursive: true });
  const nodesFile = path.join(directory, 'bundle_node_config.yaml');
  const nodes = ['source000001', 'source000002'].map((sourceId, index) => ({
    bundleNodeId: `node0000000${index + 1}`,
    sourceId,
    bundleNodeName: 'Inside',
    sourceGraphSubdirectory: 'Same',
    bundleNodeKind: 'file',
    fileType: 'md',
    listType: 'whitelist',
  }));
  fs.writeFileSync(nodesFile, YAML.stringify({ nodes }));
  return { config: new MeadowHomeBundleConfig(home, 'example', expect), nodesFile, nodes };
}

test('node lookups require a source when names are ambiguous', t => {
  const { config } = fixture(t);
  assert.throws(() => config.findNode({ bundleNodeName: 'Inside' }));
  const node = config.requireNode({ sourceId: 'source000001', bundleNodeName: 'Inside' });
  assert.equal(node.bundleNodeId, 'node00000001');
  assert.deepEqual(config.findNode({ bundleNodeId: node.bundleNodeId }), node);
  assert.equal(config.findNode({ bundleNodeName: 'Missing' }), undefined);
  assert.throws(() => config.requireNode({ bundleNodeName: 'Missing' }));
});

test('reads observe moves and removals without changing earlier snapshots', t => {
  const { config, nodesFile, nodes } = fixture(t);
  const original = config.requireNode({ sourceId: 'source000001', bundleNodeName: 'Inside' });
  const originalText = config.readNodesText();
  nodes[0].sourceGraphSubdirectory = 'Moved';
  fs.writeFileSync(nodesFile, YAML.stringify({ nodes }));
  assert.equal(config.requireNode({ bundleNodeId: original.bundleNodeId }).sourceGraphSubdirectory, 'Moved');
  assert.equal(original.sourceGraphSubdirectory, 'Same');
  assert.notEqual(config.readNodesText(), originalText);
  fs.writeFileSync(nodesFile, YAML.stringify({ nodes: nodes.slice(1) }));
  assert.equal(config.findNode({ bundleNodeId: original.bundleNodeId }), undefined);
});

test('missing node documents fail and invalid documents report their configuration path', t => {
  const { config, nodesFile } = fixture(t);
  fs.writeFileSync(nodesFile, 'nodes: invalid\n');
  assert.throws(() => config.readNodes(), error => error instanceof Error
    && error.message.includes(nodesFile) && error.message.includes('must be an array'));
  fs.unlinkSync(nodesFile);
  assert.throws(() => config.readNodes());
});
