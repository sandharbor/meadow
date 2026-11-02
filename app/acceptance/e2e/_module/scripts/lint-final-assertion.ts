// Linter: every Playwright spec under tests/ (recursively) must call either
// assertMeadowHomeState() or skipMeadowHomeStateCheck() at least once,
// somewhere after its last checkpoint() call. If a spec has no checkpoint() call,
// the call must still appear at least once. Either function is accepted —
// assertMeadowHomeState performs the real check; skipMeadowHomeStateCheck is
// a no-op that exists so a spec author can deliberately opt out without
// silently dropping the check.
//
// Run via: npx tsx _module/scripts/lint-final-assertion.ts

import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import url from "url";
import { auditFinalAssertions, FINAL_CALL_NAMES } from './spec-final-assertion.js';
import { renderLintRule } from './lint-rule.js';
import { finalAssertionGuidance } from './rules/scenario-rule-definitions.js';

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const TEST_RUNNER_DIR = path.resolve(SCRIPT_DIR, "../..");
const TESTS_DIR = path.join(TEST_RUNNER_DIR, "tests");

function main(): void {
  const collect = (input: string): string[] => statSync(input).isDirectory()
    ? readdirSync(input, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.spec.ts')).map(file => path.join(input, file))
    : input.endsWith('.spec.ts') ? [input] : [];
  const inputs = process.argv.slice(2);
  const specs = [...new Set((inputs.length ? inputs.map(input => path.resolve(input)) : [TESTS_DIR]).flatMap(collect))].sort();
  if (!specs.length) throw new Error('No .spec.ts files found in the selected paths.');
  const allIssues: string[] = [];
  let scenarioCount = 0;
  let analyzedBodies = 0;
  for (const spec of specs) {
    const audit = auditFinalAssertions(readFileSync(spec, 'utf8'), spec);
    scenarioCount += audit.scenarioCount;
    analyzedBodies += audit.analyzedBodies;
    for (const issue of audit.issues) allIssues.push(`  ${path.relative(TEST_RUNNER_DIR, spec)}:${issue.line}:${issue.column}: ${issue.message}`);
  }

  const required = FINAL_CALL_NAMES.map((n) => `${n}()`).join(" or ");
  const coverage = `${specs.length} spec(s), ${analyzedBodies}/${scenarioCount} scenario bodies checked`;
  if (allIssues.length === 0) {
    console.log(`✅ ${coverage}: all call ${required} after the last checkpoint().`);
    return;
  }

  console.error(`❌ final-assertion linter found ${allIssues.length} issue(s); ${coverage}:\n${allIssues.join('\n')}`);
  console.error(renderLintRule(finalAssertionGuidance));
  process.exitCode = 1;
}

try { main(); }
catch (error) { console.error(`final-assertion: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; }
