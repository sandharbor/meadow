/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { computeSourceHash } from '../../src/run/scripts/build_frontend.js';

test('shared diff edits and new helpers invalidate the static E2E frontend', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-frontend-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const components = path.join(root, 'shared_components', 'ConfigFileExplorer');
  fs.mkdirSync(components, { recursive: true });
  const component = path.join(components, 'DiffView.tsx');
  fs.writeFileSync(component, 'original diff renderer');
  const hash = () => computeSourceHash(root, path.join(root, 'providers'));
  const original = hash();
  assert.equal(hash(), original, 'unchanged inputs reuse the build');

  fs.writeFileSync(component, 'diff renderer with character highlights');
  const edited = hash();
  assert.notEqual(edited, original);

  const helper = path.join(components, 'inlineChanges.ts');
  fs.writeFileSync(helper, 'new comparison helper');
  assert.notEqual(hash(), edited);
  fs.rmSync(helper);
  assert.equal(hash(), edited, 'removing a helper restores the prior set of inputs');
});
