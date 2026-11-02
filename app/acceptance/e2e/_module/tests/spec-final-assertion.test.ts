/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditFinalAssertions } from '../scripts/spec-final-assertion.js';

test('modern metadata callbacks fail when the final check is missing or precedes the last checkpoint', () => {
  const missing = auditFinalAssertions(`test(name.name, { annotation: [] }, async () => {
    await sourceCommand(() => checkpoint('done'));
  });`);
  assert.equal(missing.analyzedBodies, 1);
  assert.equal(missing.scenarioCount, 1);
  assert.match(missing.issues[0].message, /must call assertMeadowHomeState\(\) or skipMeadowHomeStateCheck\(\)/);
  const early = auditFinalAssertions(`test(name.name, { annotation: [] }, async () => {
    await sourceCommand(() => assertMeadowHomeState());
    await sourceCommand(() => checkpoint('done'));
  });`);
  assert.equal(early.issues[0].line, 3);
  assert.match(early.issues[0].message, /after the last checkpoint\(\) at line 3/);
});

test('classic and modern signatures accept either final-check fixture after all checkpoints', () => {
  const audit = auditFinalAssertions(`test('classic', async function () {
    await checkpoint('first');
    await checkpoint('last');
    await assertMeadowHomeState({ allowedUntracked: ['draft.yaml'] });
  });
  test(name.name, { annotation: [] }, async () => {
    await sourceCommand(() => checkpoint('done'));
    await sourceCommand(() => skipMeadowHomeStateCheck());
  });`);
  assert.equal(audit.analyzedBodies, 2);
  assert.equal(audit.scenarioCount, 2);
  assert.deepEqual(audit.issues, []);
});

test('every scenario needs a final check even when it has no checkpoints', () => {
  assert.match(auditFinalAssertions(`test('missing', async () => {});`).issues[0].message, /must call/);
  assert.deepEqual(auditFinalAssertions(`test('checked', async () => { await assertMeadowHomeState(); });`).issues, []);
});

test('test.only, test.skip and test.fixme declarations are audited without treating conditional annotations as scenarios', () => {
  for (const modifier of ['only', 'skip', 'fixme']) {
    const audit = auditFinalAssertions(`test.${modifier}(name.name, { annotation: [] }, async () => {
      test.skip(true, 'requires a capability');
      test.fixme();
      await checkpoint('done');
    });`);
    assert.equal(audit.scenarioCount, 1);
    assert.equal(audit.analyzedBodies, 1);
    assert.equal(audit.issues.length, 1);
    assert.match(audit.issues[0].message, /must call/);
  }
});

test('unsupported authored callbacks and files without declarations produce actionable failures', () => {
  for (const declaration of [
    `test(name.name, { annotation: [] }, callback);`,
    `test('classic', callback);`,
    `test.skip(name.name, callback);`,
    `test.only('concise', async () => assertMeadowHomeState());`,
  ]) {
    const audit = auditFinalAssertions(declaration);
    assert.equal(audit.scenarioCount, 1);
    assert.equal(audit.analyzedBodies, 0);
    assert.match(audit.issues[0].message, /Cannot inspect.*inline block callback/);
  }
  assert.match(auditFinalAssertions(`test.use({ bundleMode: 'single-file' });`).issues[0].message, /No scenario declaration was checked/);
});

test('another scenario, comments, and prose cannot satisfy a missing final check', () => {
  const audit = auditFinalAssertions(`test('checked', async () => { await assertMeadowHomeState(); });
    test('missing', { annotation: [] }, async () => {
      const prose = 'skipMeadowHomeStateCheck()';
      // assertMeadowHomeState();
      await checkpoint('done');
    });`);
  assert.equal(audit.analyzedBodies, 2);
  assert.equal(audit.issues.length, 1);
  assert.match(audit.issues[0].message, /must call/);
});

test('CLI exits nonzero for missing and early finals, reports checked bodies, and discovers nested specs', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meadow-final-assertion-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'nested'));
  writeFileSync(path.join(root, 'missing.spec.ts'), `test('missing', {}, async () => { await checkpoint('done'); });`);
  writeFileSync(path.join(root, 'nested', 'early.spec.ts'), `test('early', async () => { await skipMeadowHomeStateCheck(); await checkpoint('done'); });`);
  const script = path.resolve(import.meta.dirname, '../scripts/lint-final-assertion.ts');
  const run = () => spawnSync(process.execPath, ['--import', 'tsx', script, root], { encoding: 'utf8' });
  const failed = run();
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /2 issue\(s\); 2 spec\(s\), 2\/2 scenario bodies checked/);
  assert.match(failed.stderr, /missing\.spec\.ts:1:\d+: Scenario must call/);
  assert.match(failed.stderr, /nested[/\\]early\.spec\.ts:1:\d+: Move/);
  writeFileSync(path.join(root, 'missing.spec.ts'), `test('checked', {}, async () => { await checkpoint('done'); await assertMeadowHomeState(); });`);
  writeFileSync(path.join(root, 'nested', 'early.spec.ts'), `test.skip('checked', async () => { await checkpoint('done'); await skipMeadowHomeStateCheck(); });`);
  const passed = run();
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /2 spec\(s\), 2\/2 scenario bodies checked/);
  assert.equal(passed.stderr, '');
});
