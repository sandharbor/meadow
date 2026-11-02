/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
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
  console.error(`\n❌ no-raw-data: ${count} issue(s).

Scenarios should read at the level of intent. File layout, JSON/YAML parsing,
and serialization boilerplate obscure the behavior being proved and couple
scenarios to storage details. Put that knowledge in the reusable utility or
page object responsible for the functionality under src/run, not a spec-local
helper or a generic readJson/readYaml wrapper.

For example:
  expect(bundleConfig.nodeNamed('Bridge').outlinksDepth).toBe(0);
  expect(bundleConfig.findNode({ bundleNodeName: 'Reference' })).toBeUndefined();
  expect(filters.bundleFilterNamed('Bridge emphasis')).toBeDefined();

If raw access itself is essential (for example corrupting bytes to test recovery),
explain why immediately before the smallest statement or explicit { ... } block:
  // e2e-allow-raw-data: Invalid YAML bytes are the input to this recovery test.
  { /* raw access needed for this particular claim */ }

The exception covers only that statement/block. Give a specific reason; remove
unused exceptions. Prefer an existing domain utility for ordinary setup and
assertions. See _module/docs/coding_standards.md and the E2E skill.`);
  process.exitCode = 1;
} else console.log(`✅ ${specs.length} spec(s): parsing and file I/O stay behind intent-level utilities.`);
