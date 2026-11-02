/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lintRuleGuidance } from '../scripts/rule-guidance.js';
import { lintRules } from '../scripts/rule-catalog.js';

const root = path.resolve(import.meta.dirname, '../..');
const sorted = (values: readonly string[]) => [...values].sort();

test('every lint CLI has one source-owned rule and example validator; quickcheck registration matches its stated enforcement', () => {
  const scripts = readdirSync(path.join(root, '_module/scripts'))
    // lint-rule.ts is the shared type/renderer module, not an executable checker.
    .filter(name => /^lint-.*\.ts$/.test(name) && name !== 'lint-rule.ts')
    .map(name => `_module/scripts/${name}`);
  assert.equal(new Set(lintRuleGuidance.map(rule => rule.id)).size, lintRuleGuidance.length, 'Rule IDs must be unique.');
  assert.deepEqual(sorted(lintRuleGuidance.map(rule => rule.script)), sorted(scripts), 'Every lint CLI needs guidance and executable examples.');
  assert.deepEqual(sorted(lintRules.map(rule => rule.guidance.id)), sorted(lintRuleGuidance.map(rule => rule.id)));
  for (const rule of lintRules) {
    assert.strictEqual(rule.guidance, lintRuleGuidance.find(guidance => guidance.id === rule.guidance.id), `${rule.guidance.id} must use the same metadata object as the live reference.`);
    assert.ok(existsSync(path.join(root, rule.guidance.script)));
    assert.ok(rule.guidance.why.trim() && rule.guidance.repair.trim() && rule.guidance.requirements.length);
    assert.ok(rule.guidance.examples.some(example => example.expected === 'pass'), `${rule.guidance.id} needs a valid example.`);
    assert.ok(rule.guidance.examples.some(example => example.expected === 'fail'), `${rule.guidance.id} needs an invalid example.`);
  }
  const quickcheck = readFileSync(path.join(root, '_module/scripts/quickcheck'), 'utf8');
  const registered = quickcheck.split('\n').filter(line => !/^\s*#/.test(line))
    .flatMap(line => line.match(/\bnpx\s+tsx\s+(_module\/scripts\/lint-[\w-]+\.ts)\b/)?.[1] ?? []);
  assert.deepEqual(sorted(registered), sorted(lintRuleGuidance.filter(rule => rule.enforcement === 'quickcheck').map(rule => rule.script)), 'Quickcheck registration and the authoring reference must agree about enforced rules.');
});

for (const rule of lintRules) {
  for (const example of rule.guidance.examples) {
    test(`${rule.guidance.id}: documented ${example.expected} example — ${example.name}`, async () => {
      const issues = await rule.checkExample(example);
      if (example.expected === 'pass') assert.deepEqual(issues, [], 'The advertised valid example must pass the actual validator.');
      else assert.ok(issues.length > 0, 'The advertised invalid example must fail the actual validator.');
    });
  }
}

test('the live authoring command renders every rule and supports focused lookup without refreshing files', () => {
  const script = path.join(root, '_module/scripts/rule-reference.ts');
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { encoding: 'utf8' });
  const full = run();
  assert.equal(full.status, 0, full.stderr);
  for (const rule of lintRuleGuidance) {
    assert.ok(full.stdout.includes(rule.why));
    assert.ok(full.stdout.includes(rule.repair));
    for (const example of rule.examples) assert.ok(full.stdout.includes(example.code));
  }
  const focused = run('checkpoint-keyframes');
  assert.equal(focused.status, 0, focused.stderr);
  assert.ok(focused.stdout.includes('checkpoint-keyframes'));
  assert.ok(!focused.stdout.includes('Checker: _module/scripts/lint-no-raw-data.ts'));
  assert.equal(run('not-a-rule').status, 2);
});
