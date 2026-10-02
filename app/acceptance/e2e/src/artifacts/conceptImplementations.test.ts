/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from 'node:assert/strict';
import test from 'node:test';
import { extractConceptImplementations, validateConceptImplementationRoles } from './conceptImplementations.js';
import type { AnyMeadowConcept } from '../../../../concepts/index.js';

const first = { id: 'first', implementationRoles: ['capture'] } as unknown as AnyMeadowConcept;
const second = { id: 'second', implementationRoles: ['capture', 'restore'] } as unknown as AnyMeadowConcept;
const source = (body: string, importText = "import type { first as idea, ParticipatesIn as P } from '../concepts/index.js';") =>
  [{ file: '/app/service/implementation.tsx', text: `${importText}\nexport function implement() { return <div />; }\nexport type RealMeadowConceptParticipations = [${body}];` }];
const read = (files: ReturnType<typeof source>) => extractConceptImplementations(files, '/app', { first, second });

test('extracts aliased exact identities and the TSX implementation location', () => {
  const result = read(source('P<typeof idea, "capture", typeof implement>'));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.entries, [{ conceptId: 'first', role: 'capture', symbol: 'implement', file: 'service/implementation.tsx', line: 2, column: 1 }]);
});
test('a role claimed for one concept cannot satisfy the same role on another', () => {
  const { entries } = read(source('P<typeof idea, "capture", typeof implement>'));
  assert.deepEqual(validateConceptImplementationRoles([first, second], entries), [
    'concept "second" has no inline participant for role "capture"', 'concept "second" has no inline participant for role "restore"',
  ]);
});
test('rejects a role assigned to the wrong concept and a missing implementation', () => {
  const result = read(source('P<typeof idea, "restore", typeof absent>'));
  assert.match(result.errors.join('\n'), /first.*does not declare role "restore"/);
  assert.match(result.errors.join('\n'), /absent.*implementation in this file/);
});
test('rejects private and runtime participation imports', () => {
  assert.match(read(source('P<typeof idea, "capture", typeof implement>', "import type { first as idea, ParticipatesIn as P } from '../concepts/private.js';")).errors.join('\n'), /public concepts\/index/);
  assert.match(read(source('P<typeof idea, "capture", typeof implement>', "import { first as idea, ParticipatesIn as P } from '../concepts/index.js';")).errors.join('\n'), /type-only/);
});
test('rejects participation outside the named inline declaration', () => {
  const files = source('P<typeof idea, "capture", typeof implement>');
  files[0].text = files[0].text.replace('RealMeadowConceptParticipations', 'Unrelated');
  assert.match(read(files).errors.join('\n'), /inline MeadowConceptParticipations/);
});
