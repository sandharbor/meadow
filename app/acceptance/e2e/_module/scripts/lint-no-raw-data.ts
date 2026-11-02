/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { renderLintRule } from './lint-rule.js';
import { noRawDataGuidance } from './rules/scenario-rule-definitions.js';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditRawData } from './spec-raw-data.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const specs = readdirSync(path.join(root, 'tests'), { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.spec.ts')).sort();
let count = 0;
for (const spec of specs) for (const issue of auditRawData(readFileSync(path.join(root, 'tests', spec), 'utf8'), spec)) {
  console.error(`tests/${spec}:${issue.line}:${issue.column}: ${issue.message}`);
  count++;
}
if (count) {
  console.error(`\n❌ no-raw-data: ${count} issue(s) in ${specs.length} spec(s).`);
  console.error(renderLintRule(noRawDataGuidance));
  process.exitCode = 1;
} else console.log(`✅ ${specs.length} spec(s): parsing and file I/O stay behind intent-level utilities.`);
