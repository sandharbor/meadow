/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fixtureSourceGraphs, loadSourceChanges } from '../../../../shared_code/shared_dev/sourceChanges.js';

type OwnedSourceChange = { sourceGraph: string; id: string; e2e: string };
export interface SourceChangeCoverageInput {
  changes: readonly OwnedSourceChange[];
  scenarios: readonly { filename: string; source: string }[];
  fixtures: readonly { name: string; changes: readonly OwnedSourceChange[] }[];
}

/** Definitions have already passed the shared source-change/fixture parsers. */
export function checkSourceChangeCoverage(input: SourceChangeCoverageInput): { sourceChangeCount: number; fixtureCount: number } {
  const owners = new Map<string, string>();
  for (const change of input.changes) {
    const graph = change.sourceGraph;
    const key = `${graph}/${change.id}`;
    if (owners.has(change.e2e)) throw new Error(`${change.e2e} owns both ${owners.get(change.e2e)} and ${key}; each change needs its own scenario`);
    owners.set(change.e2e, key);
    const matches = input.scenarios.filter(scenario => path.basename(scenario.filename) === change.e2e);
    if (matches.length !== 1) throw new Error(`${key}: expected one scenario named ${change.e2e}, found ${matches.length}`);
    const scenario = matches[0];
    const ast = ts.createSourceFile(scenario.filename, scenario.source, ts.ScriptTarget.Latest, true);
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
  let fixtureCount = 0;
  for (const fixture of input.fixtures) {
    if (!fixture.changes.length) continue;
    fixtureCount++;
    for (const change of fixture.changes) {
      if (!owners.has(change.e2e)) throw new Error(`${fixture.name}: ${change.id} has no checked E2E scenario`);
    }
  }
  return { sourceChangeCount: owners.size, fixtureCount };
}

function scenarioFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? scenarioFiles(filename) : entry.name.endsWith('.spec.ts') ? [filename] : [];
  });
}

/** The real project scan retains the strict shared definition and fixture loaders. */
export function auditSourceChangeCoverage(root: string): { sourceChangeCount: number; fixtureCount: number } {
  const definitions = path.join(root, 'app/shared_data/source_changes');
  const fixtures = path.join(root, 'app/shared_data/home_fixtures');
  return checkSourceChangeCoverage({
    changes: fs.readdirSync(definitions).flatMap(graph => loadSourceChanges(root, graph)),
    scenarios: scenarioFiles(path.join(root, 'app/acceptance/e2e/tests')).map(filename => ({ filename, source: fs.readFileSync(filename, 'utf8') })),
    fixtures: fs.readdirSync(fixtures).filter(fixture => /^home_fixture_[a-z0-9_]+$/.test(fixture))
      .map(name => ({ name, changes: fixtureSourceGraphs(root, name).flatMap(graph => loadSourceChanges(root, graph)) })),
  });
}
