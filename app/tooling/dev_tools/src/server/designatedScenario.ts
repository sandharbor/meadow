/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import YAML from 'yaml';
import { fixtureSourceLocation } from '../../../../shared_code/shared_dev/fixtureSourceLocation.js';
import { homeFixturesDirectory } from '../../../../shared_code/shared_dev/savedStates.js';
import type { SourceChangeDefinition } from '../../../../shared_code/shared_dev/sourceChangesTypes.js';

/** Where a source change's designated E2E scenario starts. */
export interface DesignatedScenarioStart {
  fixtureName: string;
  sourceGraph: string;
  bundleSlug: string;
}

const DEFAULT_FIXTURE = 'home_fixture_big_and_small';
const WORKFLOW_BUNDLES: Record<string, string> = {
  navigateToBigBundle: 'meadow-test-bundle-big',
  navigateToBigBundlePreview: 'meadow-test-bundle-big',
};

function fixtureBundlesUsingGraph(projectRoot: string, fixtureName: string, graph: string): string[] {
  const bundles = path.join(homeFixturesDirectory(projectRoot), fixtureName, 'bundles');
  if (!fs.existsSync(bundles)) return [];
  return fs.readdirSync(bundles).filter(bundle => {
    const configPath = path.join(bundles, bundle, 'config', 'bundle_config.yaml');
    if (!fs.existsSync(configPath)) return false;
    const config = YAML.parse(fs.readFileSync(configPath, 'utf8')) as { sources?: { directory: string }[]; sourceDirectory?: string };
    const directories = config.sources?.map(source => source.directory) ?? (config.sourceDirectory ? [config.sourceDirectory] : []);
    return directories.some(directory => fixtureSourceLocation(directory).graph === graph);
  }).sort();
}

/**
 * Read the fixture, graph, and bundle from the change's designated spec, so
 * Start scenario begins exactly where the automated scenario begins. The
 * source-change coverage lint guarantees the literal apply call exists.
 */
export function designatedScenarioStart(projectRoot: string, change: SourceChangeDefinition): DesignatedScenarioStart {
  const specPath = path.join(projectRoot, 'app/acceptance/e2e/tests', change.e2e);
  const source = fs.readFileSync(specPath, 'utf8');
  const ast = ts.createSourceFile(specPath, source, ts.ScriptTarget.Latest, true);
  let fixtureName = DEFAULT_FIXTURE;
  let sourceGraph: string | undefined;
  const mentioned: { text: string; position: number }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'fixtureHome' && ts.isStringLiteralLike(node.initializer)) {
      fixtureName = node.initializer.text;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(ast) === 'sourceChanges' && node.expression.name.text === 'apply') {
      const [id, graph] = node.arguments;
      if (id && ts.isStringLiteralLike(id) && id.text === change.id) {
        sourceGraph = graph && ts.isStringLiteralLike(graph) ? graph.text : 'meadow-test-bundles-data';
      }
    }
    if (ts.isStringLiteralLike(node)) mentioned.push({ text: node.text, position: node.getStart(ast) });
    if (ts.isIdentifier(node) && WORKFLOW_BUNDLES[node.text]) mentioned.push({ text: WORKFLOW_BUNDLES[node.text], position: node.getStart(ast) });
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!sourceGraph) throw new Error(`${change.e2e} does not apply ${change.id}`);
  const candidates = fixtureBundlesUsingGraph(projectRoot, fixtureName, sourceGraph);
  const bundleSlug = mentioned.sort((a, b) => a.position - b.position).map(item => item.text).find(text => candidates.includes(text))
    ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!bundleSlug) throw new Error(`${change.e2e} does not identify which ${fixtureName} bundle it reviews`);
  return { fixtureName, sourceGraph, bundleSlug };
}
