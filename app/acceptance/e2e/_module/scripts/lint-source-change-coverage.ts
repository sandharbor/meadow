/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { fileURLToPath } from 'node:url';
import { auditSourceChangeCoverage } from './source-change-coverage.js';
import { renderLintRule } from './lint-rule.js';
import { sourceChangeCoverageRule } from './rules/project-rule-definitions.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
try {
  const { sourceChangeCount, fixtureCount } = auditSourceChangeCoverage(root);
  console.log(`✅ ${sourceChangeCount} source changes each have one E2E scenario, covering all ${fixtureCount} fixture menus.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(renderLintRule(sourceChangeCoverageRule));
  process.exitCode = 1;
}
