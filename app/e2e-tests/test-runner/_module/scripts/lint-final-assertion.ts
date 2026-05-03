// Linter: every Playwright spec in tests/ must call assertMeadowHomeState()
// at least once, somewhere after its last snapshot() call. If a spec has no
// snapshot() call, assertMeadowHomeState() must still appear at least once.
//
// Run via: npx tsx _module/scripts/lint-final-assertion.ts

import { readFileSync, readdirSync } from "fs";
import path from "path";
import url from "url";
import ts from "typescript";

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const TEST_RUNNER_DIR = path.resolve(SCRIPT_DIR, "../..");
const TESTS_DIR = path.join(TEST_RUNNER_DIR, "tests");

const ASSERTION_NAME = "assertMeadowHomeState";
const SNAPSHOT_NAME = "snapshot";

interface Issue {
  file: string;
  testTitle: string;
  message: string;
}

function findCallsByName(node: ts.Node, name: string, out: ts.CallExpression[]): void {
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isIdentifier(callee) && callee.text === name) {
      out.push(node);
    }
  }
  ts.forEachChild(node, (child) => findCallsByName(child, name, out));
}

function isTestCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return ts.isIdentifier(callee) && callee.text === "test";
}

function getTestTitle(call: ts.CallExpression): string {
  const arg = call.arguments[0];
  if (arg && ts.isStringLiteralLike(arg)) return arg.text;
  return "(unknown)";
}

function getTestBody(call: ts.CallExpression): ts.Block | null {
  // test("title", async ({...}) => { ... })
  const fn = call.arguments[1];
  if (!fn) return null;
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
    const body = fn.body;
    if (body && ts.isBlock(body)) return body;
  }
  return null;
}

function checkSpec(filePath: string): Issue[] {
  const issues: Issue[] = [];
  const text = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.ESNext, true);

  const testCalls: ts.CallExpression[] = [];
  function walk(node: ts.Node) {
    if (isTestCall(node)) testCalls.push(node);
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);

  for (const call of testCalls) {
    const title = getTestTitle(call);
    const body = getTestBody(call);
    if (!body) continue;

    const snapshotCalls: ts.CallExpression[] = [];
    findCallsByName(body, SNAPSHOT_NAME, snapshotCalls);
    const assertionCalls: ts.CallExpression[] = [];
    findCallsByName(body, ASSERTION_NAME, assertionCalls);

    if (assertionCalls.length === 0) {
      issues.push({
        file: filePath,
        testTitle: title,
        message: `must call ${ASSERTION_NAME}() at least once (after the last snapshot())`,
      });
      continue;
    }

    if (snapshotCalls.length === 0) continue;

    const lastSnapshot = snapshotCalls[snapshotCalls.length - 1];
    const lastAssertion = assertionCalls[assertionCalls.length - 1];
    if (lastAssertion.getStart() < lastSnapshot.getEnd()) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(lastSnapshot.getStart());
      issues.push({
        file: filePath,
        testTitle: title,
        message: `last ${ASSERTION_NAME}() must appear after the last snapshot() call (last snapshot at line ${line + 1})`,
      });
    }
  }

  return issues;
}

function main(): void {
  const specs = readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => path.join(TESTS_DIR, f))
    .sort();

  const allIssues: Issue[] = [];
  for (const spec of specs) {
    allIssues.push(...checkSpec(spec));
  }

  if (allIssues.length === 0) {
    console.log(`✅ ${specs.length} spec(s): all tests call ${ASSERTION_NAME}() after the last snapshot().`);
    return;
  }

  console.error(`❌ ${ASSERTION_NAME} linter found ${allIssues.length} issue(s):`);
  for (const issue of allIssues) {
    const rel = path.relative(TEST_RUNNER_DIR, issue.file);
    console.error(`  ${rel}: "${issue.testTitle}"`);
    console.error(`    ${issue.message}`);
  }
  process.exit(1);
}

main();
