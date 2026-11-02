// Linter: Playwright specs describe user-visible behavior and must not call
// .locator() directly. DOM selectors and structural knowledge belong in the
// page or component object responsible for that functionality.
//
// Run via: npx tsx _module/scripts/lint-no-direct-locators.ts

import { readFileSync, readdirSync } from "fs";
import path from "path";
import url from "url";
import { auditDirectLocators } from './spec-direct-locators.js';
import { renderLintRule } from './lint-rule.js';
import { noDirectLocatorsGuidance } from './rules/scenario-rule-definitions.js';

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const TEST_RUNNER_DIR = path.resolve(SCRIPT_DIR, "../..");
const TESTS_DIR = path.join(TEST_RUNNER_DIR, "tests");

function main(): void {
  const specs = readdirSync(TESTS_DIR, { recursive: true })
    .filter((file): file is string =>
      typeof file === "string" && file.endsWith(".spec.ts")
    )
    .map((file) => path.join(TESTS_DIR, file))
    .sort();

  const issues = specs.flatMap(file => auditDirectLocators(readFileSync(file, 'utf8'), file).map(issue => ({ ...issue, file })));
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
  console.error(renderLintRule(noDirectLocatorsGuidance));
  process.exit(1);
}

main();
