/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import { bridgeExclusion, conceptLink, conceptText, linkedScenarioName, linkedScenarioDescription, scopeExclusion } from '../../../../concepts/index.js';
import ArtifactReporter, { getTestArtifactDirectory } from '../../src/run/artifactReporter.js';

// This file participates in the ordinary E2E TypeScript check.
if (false) {
  // @ts-expect-error An unregistered concept cannot appear in a typed scenario name.
  conceptLink('missing-scope-document', 'scope exclusion');
}

test('a typed name retains its plain title, plural suffix, captured links, and following description', t => {
  const text = conceptText`Review ${conceptLink(scopeExclusion.id, 'scope exclusion')}s`;
  const name = linkedScenarioName(text);
  assert.equal(name.name, 'Review scope exclusions');
  const directory = mkdtempSync(path.join(os.tmpdir(), 'linked-scenario-name-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'scenario.spec.ts');
  writeFileSync(filename, 'const name = linkedScenarioName(typedText);\n/* The description follows the named variable. */\ntest(name.name, {}, async () => {});');
  const reporter = new ArtifactReporter({ outputDir: directory });
  reporter.onTestBegin({ title: name.name, annotations: [name.annotation], location: { file: filename, line: 3, column: 1 } } as unknown as TestCase,
    { startTime: new Date() } as TestResult);
  const artifact = getTestArtifactDirectory(name.name, directory);
  assert.deepEqual(JSON.parse(readFileSync(path.join(artifact, 'name-text.json'), 'utf8')), text);
  assert.equal(readFileSync(path.join(artifact, 'description.txt'), 'utf8'), 'The description follows the named variable.');
  writeFileSync(filename, '// Edited after capture');
  assert.deepEqual(JSON.parse(readFileSync(path.join(artifact, 'name-text.json'), 'utf8')), text);
});

test('formal linked descriptions override comment extraction and retain their captured links', t => {
  const text = conceptText`Combine a staged ${conceptLink(bridgeExclusion.id, 'bridge exclusion')} with an external departure.`;
  const description = linkedScenarioDescription(text);
  assert.equal(description.description, 'Combine a staged bridge exclusion with an external departure.');
  const directory = mkdtempSync(path.join(os.tmpdir(), 'linked-scenario-description-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'scenario.spec.ts');
  writeFileSync(filename, 'const description = linkedScenarioDescription(typedText);\n/* Old comment must not override formal metadata. */\ntest("scenario", {}, async () => {});');
  const reporter = new ArtifactReporter({ outputDir: directory });
  reporter.onTestBegin({ title: 'scenario', annotations: [description.annotation], location: { file: filename, line: 3, column: 1 } } as unknown as TestCase,
    { startTime: new Date() } as TestResult);
  const artifact = getTestArtifactDirectory('scenario', directory);
  assert.deepEqual(JSON.parse(readFileSync(path.join(artifact, 'description-text.json'), 'utf8')), text);
  assert.equal(readFileSync(path.join(artifact, 'description.txt'), 'utf8'), description.description);
  writeFileSync(filename, '// Edited after capture');
  assert.deepEqual(JSON.parse(readFileSync(path.join(artifact, 'description-text.json'), 'utf8')), text);
});
