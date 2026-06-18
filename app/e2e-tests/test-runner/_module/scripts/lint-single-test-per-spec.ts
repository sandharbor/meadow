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

function isTestCaseCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;

  const callee = node.expression;
  if (ts.isIdentifier(callee) && callee.text === "test") {
    return isStringArg(node.arguments[0]);
  }

  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (!ts.isIdentifier(callee.expression) || callee.expression.text !== "test") return false;
  if (!["only", "skip", "fixme"].includes(callee.name.text)) return false;
  return isStringArg(node.arguments[0]);
}

function findTestCases(filePath: string): TestCase[] {
  const text = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.ESNext, true);
  const tests: TestCase[] = [];

  function walk(node: ts.Node): void {
    if (isTestCaseCall(node)) {
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

function main(): void {
  const specs = readdirSync(TESTS_DIR, { recursive: true })
    .filter((f): f is string => typeof f === "string" && f.endsWith(".spec.ts"))
    .map((f) => path.join(TESTS_DIR, f))
    .sort();

  const issues: Issue[] = [];
  for (const spec of specs) {
    const tests = findTestCases(spec);
    if (tests.length !== 1) {
      issues.push({ file: spec, tests });
    }
  }

  if (issues.length === 0) {
    console.log(`✅ ${specs.length} spec(s): each file defines exactly one test case.`);
    return;
  }

  console.error(`❌ single-test-per-spec linter found ${issues.length} issue(s):`);
  for (const issue of issues) {
    const rel = path.relative(TEST_RUNNER_DIR, issue.file);
    console.error(`  ${rel}: defines ${issue.tests.length} test case(s), expected exactly 1`);
    for (const testCase of issue.tests) {
      console.error(`    line ${testCase.line}: "${testCase.title}"`);
    }
  }
  console.error(`
How to fix
----------

Move each test case into its own .spec.ts file. Shared setup and helper code
should live in a non-.spec.ts module next to the specs or under src/run/utils.
`.trimEnd());
  process.exit(1);
}

main();
