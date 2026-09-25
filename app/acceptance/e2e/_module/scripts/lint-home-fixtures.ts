/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

// Home fixtures are hand-authored saved states. Generated data, Git metadata,
// machine-local resources, secrets, and logs belong only to an opened home.

import { fileURLToPath } from 'node:url';
import { homeFixtureViolations, listHomeFixtures } from '../../../../shared_code/shared_dev/savedStates.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const fixtures = listHomeFixtures(root);
const violations = fixtures.flatMap(fixture => homeFixtureViolations(root, fixture));
if (violations.length > 0) {
  console.error(`❌ Home fixtures contain non-authored files:\n${violations.map(line => `  ${line}`).join('\n')}`);
  process.exit(1);
}
console.log(`✅ ${fixtures.length} home fixture(s) contain only authored files.`);
