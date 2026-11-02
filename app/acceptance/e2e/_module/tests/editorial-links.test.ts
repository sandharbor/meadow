/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { editorialLinkIssues } from '../scripts/editorial-links.js';

const index = {
  exportNameToId: new Map([['sourceSnapshot', 'source-snapshot'], ['preventAccidentalSharing', 'prevent-accidental-sharing']]),
  conceptIds: new Set(['source-snapshot']),
};
const source = `
import { conceptText, conceptLink, linkedScenarioDescription, scenarioSections, sourceSnapshot, preventAccidentalSharing } from '../../../concepts/index.js';
const description = linkedScenarioDescription(conceptText\`Accept the \${conceptLink(sourceSnapshot.id, 'Source Snapshot')}.\`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText\`Open the accepted \${conceptLink(sourceSnapshot.id, 'snapshot')}.\` },
  accept: { type: 'test', text: conceptText\`Accept the candidate \${conceptLink(sourceSnapshot.id, 'snapshot')}.\` },
});
`;
const check = (text: string) => editorialLinkIssues(ts.createSourceFile('example.spec.ts', text, ts.ScriptTarget.Latest, true), index);

test('each description and section, including setup, needs its own prose link', () => {
  assert.deepEqual(check(source), []);
  for (const label of ['Source Snapshot', 'snapshot']) {
    const unlinked = source.replace(`\${conceptLink(sourceSnapshot.id, '${label}')}`, label);
    const issues = check(unlinked);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, label === 'Source Snapshot' ? /description/ : /section setup/);
    assert.ok(issues[0].line > 1);
  }
  assert.equal(check(source.replaceAll(/\$\{conceptLink\(sourceSnapshot.id, '[^']+'\)\}/g, 'snapshot')).length, 3);
});

test('import aliases and known literal concept IDs are supported', () => {
  const aliased = source.replace('conceptText,', 'conceptText as text,').replaceAll('conceptText`', 'text`')
    .replace('conceptLink,', 'conceptLink as link,').replaceAll('conceptLink(', 'link(')
    .replace('sourceSnapshot,', 'sourceSnapshot as snapshot,').replaceAll('sourceSnapshot.id', 'snapshot.id');
  assert.deepEqual(check(aliased), []);
  assert.deepEqual(check(source.replaceAll('sourceSnapshot.id', "'source-snapshot'")), []);
});

test('comments, keyframes, Markdown links, and unrelated helper calls cannot satisfy the rule', () => {
  const plain = source.replaceAll(/\$\{conceptLink\(sourceSnapshot.id, '[^']+'\)\}/g, '[snapshot](source-snapshot)');
  const extra = `\n// conceptLink(sourceSnapshot.id, 'snapshot')\naddKeyFrame(sourceSnapshot);\n`;
  assert.equal(check(plain + extra).length, 3);
  assert.equal(check(source.replace("../../../concepts/index.js", './unrelated.js')).length, 2);
  assert.equal(check(source.replaceAll('conceptLink(sourceSnapshot.id', 'fakeLink(sourceSnapshot.id')).length, 3);
});

test('unknown IDs, non-concept documents, and empty link labels do not count', () => {
  assert.equal(check(source.replaceAll('sourceSnapshot.id', "'missing-id'" )).length, 3);
  assert.equal(check(source.replaceAll('sourceSnapshot.id', 'preventAccidentalSharing.id')).length, 3);
  assert.equal(check(source.replaceAll("'snapshot'", "'  '")).length, 2);
});

test('missing sections and opaque section declarations produce findings rather than false passes', () => {
  assert.match(check(source.replace(/const sections = [\s\S]*/, ''))[0].message, /Declare sections/);
  assert.match(check(source.replace(/scenarioSections\(\{[\s\S]*\}\);/, 'scenarioSections({});'))[0].message, /non-empty/);
  assert.match(check(source.replace("setup: { type: 'setup', text:", "...sharedSections, setup: { type: 'setup', text:"))[0].message, /explicit section/);
});
