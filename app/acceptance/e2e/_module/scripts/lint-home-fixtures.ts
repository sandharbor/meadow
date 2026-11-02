/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

// Home fixtures are hand-authored saved states. Generated data, Git metadata,
// machine-local resources, secrets, and logs belong only to an opened home.

import { fileURLToPath } from 'node:url';
import { homeFixtureViolations, listHomeFixtures } from '../../../../shared_code/shared_dev/savedStates.js';
import { renderLintRule } from './lint-rule.js';
import { homeFixturesRule } from './rules/project-rule-definitions.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
try {
  const fixtures = listHomeFixtures(root);
  const violations = fixtures.flatMap(fixture => homeFixtureViolations(root, fixture));
  if (violations.length > 0) throw new Error(`❌ Home fixtures contain non-authored files:\n${violations.map(line => `  ${line}`).join('\n')}`);
  console.log(`✅ ${fixtures.length} home fixture(s) contain only authored files.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(renderLintRule(homeFixturesRule));
  process.exitCode = 1;
}
