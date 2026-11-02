/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditRawData } from '../scripts/spec-raw-data.js';

test('raw parsing and file I/O are caught inside scenarios and local helpers', () => {
  const issues = auditRawData(`import fs from 'node:fs'; import YAML from 'yaml';
    const read = () => YAML.parse(fs.readFileSync('nodes.yaml', 'utf8'));
    test('scenario', () => { JSON.parse('{}'); fs.writeFileSync('x', 'y'); });`);
  assert.equal(issues.length, 4);
  assert.deepEqual(issues.map(issue => issue.line), [2, 2, 3, 3]);
});

test('aliases, namespace imports, bracket access, promises, and require retain the boundary', () => {
  assert.equal(auditRawData(`import { parse as decode } from 'yaml';
    import { readFile as load } from 'node:fs/promises';
    import * as files from 'fs';
    const { readFileSync: read } = files;
    const parse = JSON['parse'];
    decode(''); load('x'); read('x'); parse('{}');
    require('node:fs').writeFileSync('x', 'y');`).length, 5);
});

test('reasoned exceptions apply to just the next statement or explicit block', () => {
  const issues = auditRawData(`import fs from 'fs';
    // e2e-allow-raw-data: Inject invalid bytes to exercise corruption recovery.
    { fs.writeFileSync('broken.yaml', ': :'); JSON.parse('{}'); }
    JSON.parse('{}');
    // e2e-allow-raw-data: Compare exact bytes after the recovery operation.
    const bytes = fs.readFileSync('broken.yaml');
    fs.readFileSync('other.yaml');`);
  assert.deepEqual(issues.map(issue => issue.line), [4, 7]);
});

test('missing reasons, unused markers, and markers on function bodies fail', () => {
  assert.match(auditRawData('// e2e-allow-raw-data:\nJSON.parse("{}");')[0].message, /specific reason/);
  assert.match(auditRawData('// e2e-allow-raw-data: Nothing here needs raw data.\nexpect(true);')[0].message, /Unused/);
  assert.ok(auditRawData(`const read = () =>
    // e2e-allow-raw-data: This function body cannot opt out of the rule.
    { JSON.parse('{}'); };`).length > 0);
});

test('ordinary JSON diagnostics, response APIs, prose and template literals are allowed', () => {
  assert.deepEqual(auditRawData(`const text = 'JSON.parse(fs.readFileSync())';
    const template = \`literal // e2e-allow-raw-data: not a comment\`;
    // JSON.parse is discussed here, not executed.
    JSON.stringify({}); response.json(); config.nodeNamed('Bridge');`), []);
});

test('exceptions after templates and inside nested callbacks are recognized', () => {
  assert.deepEqual(auditRawData(`const key = \`bundle-\${name}\`;
    test('case', async () => {
      // e2e-allow-raw-data: Read the captured URL from the test-only external opener.
      await sourceCommand(() => JSON.parse('{}'));
    });`), []);
});
