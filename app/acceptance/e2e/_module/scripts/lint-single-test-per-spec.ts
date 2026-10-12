// Linter: every Playwright .spec.ts file under tests/ must define exactly
// one test case. The report viewer shows the full source file for a scenario,
// so bundling several test cases into one spec makes review noisy and
// misleading.
//
// Run via: npx tsx _module/scripts/lint-single-test-per-spec.ts

import { readFileSync, readdirSync } from "fs";
import path from "path";
import url from "url";
import ts from "typescript";
import { isScenarioTestCall, scenarioMetadataIssues } from './scenario-metadata.js';
import { declaredScenarioAreas } from '../../src/artifacts/declaredScenarioAreas.js';
import * as concepts from '../../../../concepts/index.js';

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const TEST_RUNNER_DIR = path.resolve(SCRIPT_DIR, "../..");
const TESTS_DIR = path.join(TEST_RUNNER_DIR, "tests");

interface TestCase {
  title: string;
  line: number;
}

interface Issue {
  file: string;
  tests: TestCase[];
}

function isStringArg(node: ts.Node | undefined): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return !!node && ts.isStringLiteralLike(node);
}

function findTestCases(filePath: string): TestCase[] {
  const text = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.ESNext, true);
  const tests: TestCase[] = [];

  function walk(node: ts.Node): void {
    if (isScenarioTestCall(node)) {
      const titleArg = node.arguments[0];
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      tests.push({
        title: isStringArg(titleArg) ? titleArg.text : "(unknown)",
        line: line + 1,
      });
    }
    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
  return tests;
}

/** Declared areas must be report areas, and each sub-area must belong to one of them. */
function scenarioAreaIssues(source: ts.SourceFile): string[] {
  const declared = declaredScenarioAreas(source);
  if (!declared) return [];
  const exported = concepts as unknown as Record<string, concepts.AnyMeadowConcept | undefined>;
  const areaIds = new Set<string>(concepts.acceptanceAppAreaConcepts.map(area => area.id));
  const issues: string[] = [];
  const declaredAreaIds = declared.appAreas.map(name => exported[name]?.id ?? name);
  for (const [index, name] of declared.appAreas.entries()) {
    if (!areaIds.has(declaredAreaIds[index])) issues.push(`${name} is not an app area shown in reports.`);
  }
  for (const name of declared.subAreas) {
    if (!exported[name]?.subAreas?.some(entry => declaredAreaIds.includes(entry.areaId))) {
      issues.push(`${name} is not a sub-area of a declared app area.`);
    }
  }
  for (const list of [declared.appAreas, declared.subAreas]) {
    if (new Set(list).size !== list.length) issues.push('scenarioAreas lists an area more than once.');
  }
  return issues;
}

function main(): void {
  const specs = readdirSync(TESTS_DIR, { recursive: true })
    .filter((f): f is string => typeof f === "string" && f.endsWith(".spec.ts"))
    .map((f) => path.join(TESTS_DIR, f))
    .sort();

  const issues: Issue[] = [];
  const metadataIssues: string[] = [];
  for (const spec of specs) {
    const tests = findTestCases(spec);
    if (tests.length !== 1) {
      issues.push({ file: spec, tests });
    }
    const source = ts.createSourceFile(spec, readFileSync(spec, 'utf8'), ts.ScriptTarget.ESNext, true);
    for (const issue of scenarioMetadataIssues(source)) metadataIssues.push(`  ${path.relative(TEST_RUNNER_DIR, spec)}:${issue.line}: ${issue.message}`);
    for (const issue of scenarioAreaIssues(source)) metadataIssues.push(`  ${path.relative(TEST_RUNNER_DIR, spec)}: ${issue}`);
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
  console.error(`
How to fix
----------

Move each test case into its own .spec.ts file. Shared setup and helper code
should live in a non-.spec.ts module next to the specs or under src/run/utils.
Declare const name = linkedScenarioName(conceptText\`…\`), then
const description = linkedScenarioDescription(conceptText\`…\`), then
const areas = scenarioAreas([...app areas], { subAreas: [...] }), using the helpers
from concepts/index.js. List only the areas whose behavior the scenario exercises;
linked concepts never add areas. Pass name.name as the title and all three
metadata annotations alongside the scenario-id annotation.
`.trimEnd());
  process.exit(1);
}

main();
