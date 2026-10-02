/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { allCoreConcepts } from '../../index.js';
import { readConceptImplementations, validateConceptImplementationRoles } from '../../../acceptance/e2e/src/artifacts/conceptImplementations.js';

const { entries, errors } = readConceptImplementations(path.resolve(import.meta.dirname, '../../..'));
errors.push(...validateConceptImplementationRoles(allCoreConcepts, entries));
if (errors.length) throw new Error(`Invalid MeadowConcept participation:\n- ${errors.join('\n- ')}`);
console.log(`Concept participation passed: ${entries.length} exact concept/role/symbol identities.`);
