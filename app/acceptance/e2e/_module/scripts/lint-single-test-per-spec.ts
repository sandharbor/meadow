// Linter: every Playwright .spec.ts file under tests/ must define exactly
// one test case. The report viewer shows the full source file for a scenario,
// so bundling several test cases into one spec makes review noisy and
// misleading.
//
// Run via: npx tsx _module/scripts/lint-single-test-per-spec.ts

import { readFileSync, readdirSync } from "fs";
import path from "path";
import url from "url";
import { loadDocumentRegistry } from '../../../../concepts/loadRegistry.js';
import { auditScenarioSpec, type TestCase } from './spec-scenario-metadata.js';
import { renderLintRule } from './lint-rule.js';
import { singleTestPerSpecGuidance } from './rules/scenario-rule-definitions.js';

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const TEST_RUNNER_DIR = path.resolve(SCRIPT_DIR, "../..");
const TESTS_DIR = path.join(TEST_RUNNER_DIR, "tests");

interface Issue { file: string; tests: TestCase[]; }

const registry = await loadDocumentRegistry();

function main(): void {
  const specs = readdirSync(TESTS_DIR, { recursive: true })
    .filter((f): f is string => typeof f === "string" && f.endsWith(".spec.ts"))
    .map((f) => path.join(TESTS_DIR, f))
    .sort();

  const issues: Issue[] = [];
  const metadataIssues: string[] = [];
  for (const spec of specs) {
    const audit = auditScenarioSpec(readFileSync(spec, 'utf8'), registry, spec);
    if (audit.tests.length !== 1) issues.push({ file: spec, tests: audit.tests });
    for (const issue of audit.issues) metadataIssues.push(`  ${path.relative(TEST_RUNNER_DIR, spec)}:${issue.line}: ${issue.message}`);
  }

  if (issues.length === 0 && metadataIssues.length === 0) {
    console.log(`✅ ${specs.length} spec(s): each defines one test with a linked scenario name, description, and declared areas.`);
    return;
  }

  if (issues.length) console.error(`❌ single-test-per-spec linter found ${issues.length} issue(s):`);
  for (const issue of issues) {
    const rel = path.relative(TEST_RUNNER_DIR, issue.file);
    console.error(`  ${rel}: defines ${issue.tests.length} test case(s), expected exactly 1`);
    for (const testCase of issue.tests) {
      console.error(`    line ${testCase.line}: "${testCase.title}"`);
    }
  }
  if (metadataIssues.length) console.error(`❌ scenario metadata linter found ${metadataIssues.length} issue(s):\n${metadataIssues.join('\n')}`);
  console.error(renderLintRule(singleTestPerSpecGuidance));
  process.exit(1);
}

main();
