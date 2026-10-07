/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { scenarioMetadataIssues } from '../scripts/scenario-metadata.js';

const source = `
import { conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';
test.use({ bundleMode: 'single-file' });
const name = linkedScenarioName(conceptText\`A scenario\`);
const description = linkedScenarioDescription(conceptText\`An existing description.\`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'stable-id' }, name.annotation, description.annotation] }, async () => {});
`;
const check = (text: string) => scenarioMetadataIssues(ts.createSourceFile('example.spec.ts', text, ts.ScriptTarget.Latest, true));

test('typed name and description annotations pass for normal, focused, and skipped scenarios', () => {
  for (const callee of ['test', 'test.only', 'test.skip', 'test.fixme']) assert.deepEqual(check(source.replace('test(name.name', `${callee}(name.name`)), []);
  assert.deepEqual(check(source.replace('linkedScenarioName,', 'linkedScenarioName as linkedName,').replace('= linkedScenarioName(', '= linkedName(')), []);
});

test('both metadata declarations are required and ordinary comments cannot replace the description', () => {
  for (const variable of ['name', 'description']) {
    const withoutDeclaration = source.replace(new RegExp(`const ${variable} = [^\n]+\n`), '/* A legacy description. */\n');
    assert.ok(check(withoutDeclaration).some(issue => issue.message.includes(`const ${variable} =`)));
  }
});

test('unused metadata is rejected if the title or captured annotations omit it', () => {
  assert.ok(check(source.replace('test(name.name,', "test('A scenario',")).some(issue => issue.message.includes('test title')));
  for (const variable of ['name', 'description']) {
    assert.ok(check(source.replace(`, ${variable}.annotation`, '')).some(issue => issue.message.includes(`${variable}.annotation`)));
  }
});

test('prose must be non-empty typed text from the registry and declared in name-description order', () => {
  assert.ok(check(source.replace('conceptText`An existing description.`', "'An existing description.'")).some(issue => issue.message.includes('typed conceptText')));
  assert.ok(check(source.replace('An existing description.', '   ')).some(issue => issue.message.includes('non-empty')));
  assert.ok(check(source.replace('../../../../concepts/index.js', './fake-helper.js')).some(issue => issue.message.includes('importing the helper')));
  const reversed = source.replace(/const name[^\n]+\nconst description[^\n]+/, 'const description = linkedScenarioDescription(conceptText`Description`);\nconst name = linkedScenarioName(conceptText`Name`);');
  assert.ok(check(reversed).some(issue => issue.message.includes('before its description')));
});
