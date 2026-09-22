/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { fixtureSourceGraphs, loadSourceChanges } from '../../../../shared_code/shared_dev/sourceChanges.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const tests = path.join(root, 'app/acceptance/e2e/tests');
const definitions = path.join(root, 'app/shared_data/source_changes');
const owners = new Map<string, string>();
for (const graph of fs.readdirSync(definitions)) {
  for (const change of loadSourceChanges(root, graph)) {
    const key = `${graph}/${change.id}`;
    if (owners.has(change.e2e)) throw new Error(`${change.e2e} owns both ${owners.get(change.e2e)} and ${key}; each change needs its own scenario`);
    owners.set(change.e2e, key);
    const file = path.join(tests, change.e2e);
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let applies = false;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(ast) === 'sourceChanges' && node.expression.name.text === 'apply') {
        const [id, sourceGraph] = node.arguments;
        if (id && ts.isStringLiteral(id) && id.text === change.id
          && (sourceGraph && ts.isStringLiteral(sourceGraph) ? sourceGraph.text : 'meadow-test-bundles-data') === graph) applies = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    if (!applies) throw new Error(`${change.e2e} must apply its shared source change ${key}`);
  }
}

// Every fixture exposing changes uses the same checked definitions, including
// nested and SRS, whose graphs are shared with the big-and-small fixture.
let fixtureCount = 0;
const fixtures = path.join(root, 'app/shared_data/home_fixtures');
for (const fixture of fs.readdirSync(fixtures)) {
  if (!/^home_fixture_[a-z0-9_]+$/.test(fixture)) continue;
  const changes = fixtureSourceGraphs(root, fixture).flatMap(graph => loadSourceChanges(root, graph));
  if (!changes.length) continue;
  fixtureCount++;
  for (const change of changes) {
    if (!owners.has(change.e2e)) throw new Error(`${fixture}: ${change.id} has no checked E2E scenario`);
  }
}
console.log(`✅ ${owners.size} source changes each have one E2E scenario, covering all ${fixtureCount} fixture menus.`);
