// Linter: every Playwright spec in tests/ must call either
// assertMeadowHomeState() or skipMeadowHomeStateCheck() at least once,
// somewhere after its last snapshot() call. If a spec has no snapshot() call,
// the call must still appear at least once. Either function is accepted —
// assertMeadowHomeState performs the real check; skipMeadowHomeStateCheck is
// a no-op that exists so a spec author can deliberately opt out without
// silently dropping the check.
//
// Run via: npx tsx _module/scripts/lint-final-assertion.ts

import { readFileSync, readdirSync } from "fs";
import path from "path";
import url from "url";
import ts from "typescript";

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const TEST_RUNNER_DIR = path.resolve(SCRIPT_DIR, "../..");
const TESTS_DIR = path.join(TEST_RUNNER_DIR, "tests");

const FINAL_CALL_NAMES = ["assertMeadowHomeState", "skipMeadowHomeStateCheck"] as const;
const SNAPSHOT_NAME = "snapshot";

interface Issue {
  file: string;
  testTitle: string;
  message: string;
}

function findCallsByName(node: ts.Node, names: readonly string[], out: ts.CallExpression[]): void {
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isIdentifier(callee) && names.includes(callee.text)) {
      out.push(node);
    }
  }
  ts.forEachChild(node, (child) => findCallsByName(child, names, out));
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
    findCallsByName(body, [SNAPSHOT_NAME], snapshotCalls);
    const finalCalls: ts.CallExpression[] = [];
    findCallsByName(body, FINAL_CALL_NAMES, finalCalls);

    const required = FINAL_CALL_NAMES.map((n) => `${n}()`).join(" or ");
    if (finalCalls.length === 0) {
      issues.push({
        file: filePath,
        testTitle: title,
        message: `must call ${required} at least once (after the last snapshot())`,
      });
      continue;
    }

    if (snapshotCalls.length === 0) continue;

    const lastSnapshot = snapshotCalls[snapshotCalls.length - 1];
    const lastFinalCall = finalCalls[finalCalls.length - 1];
    if (lastFinalCall.getStart() < lastSnapshot.getEnd()) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(lastSnapshot.getStart());
      issues.push({
        file: filePath,
        testTitle: title,
        message: `last ${required} must appear after the last snapshot() call (last snapshot at line ${line + 1})`,
      });
    }
  }

  return issues;
}

const HOW_TO_FIX = `
How to fix
----------

Every spec must end (somewhere after its last snapshot() call) with one of
these calls. Pick whichever describes your intent — the linter accepts
either, and the second one is the deliberate opt-out:

  await assertMeadowHomeState();
      // Assert: no untracked or modified files remain in the MeadowHome
      // configDir. Use this for tests that do all their writes via Save
      // actions and then commit, or that don't write to MeadowHome at all.

  await assertMeadowHomeState({
    allowedUntracked: ["sites/<slug>/conf/draft_site_page_config.yaml"],
    allowedModified:  ["sites/<slug>/conf/site_page_config.yaml"],
  });
      // Assert: only these specific paths are allowed to be uncommitted.
      // Match is by exact relative path (no globs). Use this when the test
      // intentionally leaves a known set of files dirty (e.g. an unsaved
      // draft, or a Save that intentionally isn't committed).

  await skipMeadowHomeStateCheck();
      // No-op: explicitly opt out of the check. Use this only when the
      // test genuinely doesn't care about final MeadowHome state.

Wiring it up:
  1. Destructure the fixture in the test signature, next to \`snapshot\`:
       async ({ page, snapshot, assertMeadowHomeState }) => { ... }
  2. Call it at the end of the test body, AFTER the last \`await snapshot(...)\`.

If you don't know which to use, run the test and read the assertion's error
message — it lists the unexpected paths and prints the exact allow-list
literal you can paste into the call.
`.trimEnd();

function main(): void {
  const specs = readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => path.join(TESTS_DIR, f))
    .sort();

  const allIssues: Issue[] = [];
  for (const spec of specs) {
    allIssues.push(...checkSpec(spec));
  }

  const required = FINAL_CALL_NAMES.map((n) => `${n}()`).join(" or ");
  if (allIssues.length === 0) {
    console.log(`✅ ${specs.length} spec(s): all tests call ${required} after the last snapshot().`);
    return;
  }

  console.error(`❌ final-assertion linter found ${allIssues.length} issue(s):`);
  for (const issue of allIssues) {
    const rel = path.relative(TEST_RUNNER_DIR, issue.file);
    console.error(`  ${rel}: "${issue.testTitle}"`);
    console.error(`    ${issue.message}`);
  }
  console.error(HOW_TO_FIX);
  process.exit(1);
}

main();
