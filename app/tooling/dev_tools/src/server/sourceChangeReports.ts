/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ts from 'typescript';
import type { SourceChangeStatus } from '../../../../shared_code/shared_dev/sourceChangesTypes.js';

function readText(file: string): string | undefined {
  try { return fs.readFileSync(file, 'utf8').trim(); }
  catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
}

function capturedScenarioTitle(source: string): string | undefined {
  const ast = ts.createSourceFile('scenario.ts', source, ts.ScriptTarget.Latest, true);
  let title: string | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'test'
      && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) title = node.arguments[0].text;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return title;
}

/** Search each scenario's history independently, including failed runs and renamed scenario titles. */
export function latestSourceChangeRuns(specs: string[], options: {
  artifactsRoot?: string; viewerUrl?: string;
} = {}): Map<string, NonNullable<SourceChangeStatus['latestE2e']>> {
  const root = options.artifactsRoot ?? process.env.MEADOW_E2E_RUNS_DIRECTORY ?? path.join(os.homedir(), 'meadow-e2e-artifacts/current');
  const viewerUrl = options.viewerUrl ?? process.env.MEADOW_REPORT_VIEWER_URL ?? 'http://localhost:5175';
  const result = new Map<string, NonNullable<SourceChangeStatus['latestE2e']>>();
  if (!fs.existsSync(root)) return result;
  const pending = new Set(specs);
  const runs = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:_.+)?$/.test(entry.name))
    .map(entry => entry.name).sort().reverse();
  for (const runId of runs) {
    const runDir = path.join(root, runId);
    for (const entry of fs.readdirSync(runDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(runDir, entry.name);
      const sourceFile = readText(path.join(directory, 'test-file.txt'));
      const spec = sourceFile && path.basename(sourceFile);
      if (!spec || !pending.has(spec)) continue;
      // The viewer needs an assembled manifest. A newer in-progress run should
      // not replace an existing link with a report that cannot yet be opened.
      if (!fs.existsSync(path.join(directory, 'manifest.json'))) continue;
      let scenario: string | undefined;
      try {
        const meta = readText(path.join(directory, 'report-meta.json'));
        scenario = meta ? JSON.parse(meta).scenarioInfo?.testName : undefined;
        if (!scenario || scenario === entry.name) {
          const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
          scenario = capturedScenarioTitle(manifest.testSource ?? '') ?? manifest.testName;
        }
      } catch { continue; } // An artifact being assembled is not ready to link.
      if (typeof scenario !== 'string' || !scenario) continue;
      result.set(spec, { runId, scenario, url: `${viewerUrl.replace(/\/$/, '')}/${encodeURIComponent(runId)}/${encodeURIComponent(entry.name)}` });
      pending.delete(spec);
    }
    if (pending.size === 0) break;
  }
  return result;
}
