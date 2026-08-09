// Linter: Playwright specs describe user-visible behavior and must not call
// .locator() directly. DOM selectors and structural knowledge belong in the
// page or component object responsible for that functionality.
//
// Run via: npx tsx _module/scripts/lint-no-direct-locators.ts

import { readFileSync, readdirSync } from "fs";
import path from "path";
import url from "url";
import ts from "typescript";

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const TEST_RUNNER_DIR = path.resolve(SCRIPT_DIR, "../..");
const TESTS_DIR = path.join(TEST_RUNNER_DIR, "tests");

interface Issue {
  file: string;
  line: number;
  column: number;
}

function findDirectLocatorCalls(filePath: string): Issue[] {
  const text = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.ESNext,
    true,
  );
  const issues: Issue[] = [];

  function walk(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "locator"
    ) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.expression.name.getStart(sourceFile),
      );
      issues.push({
        file: filePath,
        line: line + 1,
        column: character + 1,
      });
    }
    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
  return issues;
}

function main(): void {
  const specs = readdirSync(TESTS_DIR, { recursive: true })
    .filter((file): file is string =>
      typeof file === "string" && file.endsWith(".spec.ts")
    )
    .map((file) => path.join(TESTS_DIR, file))
    .sort();

  const issues = specs.flatMap(findDirectLocatorCalls);
  if (issues.length === 0) {
    console.log(
      `✅ ${specs.length} spec(s): no direct .locator() calls; selectors stay in page/component objects.`,
    );
    return;
  }

  console.error(
    `❌ no-direct-locators linter found ${issues.length} direct .locator() call(s) in specs:`,
  );
  for (const issue of issues) {
    console.error(
      `  ${path.relative(TEST_RUNNER_DIR, issue.file)}:${issue.line}:${issue.column}`,
    );
  }
  console.error(`
Why this is a problem
---------------------

Specs should express user-visible behavior, not the DOM structure used to
implement it. A direct .locator() call couples the scenario to selectors and
construction details, making the spec harder to read and causing unrelated UI
refactors to leak into behavioral tests.

How to fix
----------

Move the locator into the page or component object responsible for that
functionality under src/run/pages, then expose an intent-revealing action or
assertion from that object. For example:

  // Spec
  await generatedSite.search.expectTitleResults(expectedTitles);

  // GeneratedSiteSearch page object
  async expectTitleResults(expectedTitles: string[]) {
    await this.expect(this.titleResultNames).toHaveText(expectedTitles);
  }

Do not hide the call in a helper declared inside the spec; the UI construction
knowledge belongs in the reusable page/component layer.
`.trimEnd());
  process.exit(1);
}

main();
