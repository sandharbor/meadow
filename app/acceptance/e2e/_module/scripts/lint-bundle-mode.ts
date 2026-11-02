/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { BUNDLE_MODES } from "../../src/run/bundleMode.js";

import { auditBundleMode } from './spec-bundle-mode.js';
import { renderLintRule } from './lint-rule.js';
import { bundleModeGuidance } from './rules/scenario-rule-definitions.js';

const testsDir = path.resolve(import.meta.dirname, "../../tests");

function listSpecFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    const isDirectory = entry.isDirectory()
      || (entry.isSymbolicLink() && statSync(fullPath).isDirectory());
    if (isDirectory) return listSpecFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".spec.ts") ? [fullPath] : [];
  });
}

const failures: string[] = [];
const counts = new Map(BUNDLE_MODES.map((mode) => [mode, 0]));

for (const specFile of listSpecFiles(testsDir)) {
  const source = readFileSync(specFile, "utf8");
  const audit = auditBundleMode(source);
  const relativePath = path.relative(testsDir, specFile);
  failures.push(...audit.issues.map(issue => `${relativePath}: ${issue}`));
  if (audit.mode) counts.set(audit.mode, counts.get(audit.mode)! + 1);
}

if (failures.length > 0) {
  console.error("E2E bundle-mode classification failed:\n");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(renderLintRule(bundleModeGuidance));
  process.exit(1);
}

console.log(
  `Bundle-mode classification passed: ${BUNDLE_MODES.map((mode) => `${mode}=${counts.get(mode)}`).join(", ")}.`
);
