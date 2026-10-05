/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scenarioIdFromSpec } from './scenarioIdentity.js';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

test('older recordings resolve scenario identity from either their title or artifact slug', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'scenario-identity-'));
  directories.push(directory);
  const filename = path.join(directory, 'test.spec.ts');
  writeFileSync(filename, `test('A renamed scenario!', { annotation: [
    { type: 'other', description: 'ignored' },
    { type: 'scenario-id', description: 'stable-id' }
  ] }, async () => {});`);
  expect(scenarioIdFromSpec(filename, 'A renamed scenario!')).toBe('stable-id');
  expect(scenarioIdFromSpec(filename, 'a-renamed-scenario')).toBe('stable-id');
  expect(scenarioIdFromSpec(filename, 'unknown')).toBeUndefined();
  expect(scenarioIdFromSpec(undefined, 'a-renamed-scenario')).toBeUndefined();
});
