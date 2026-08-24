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

import { existsSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { allAppAreaDocs, scenarioDocToAppAreaIds } from "../../src/app-area-docs/index.js";
import { findScenarioDocAppAreaAssignmentErrors } from "../../src/app-area-docs/validation.js";
import { allDocs as baseScenarioDocs } from "../../src/scenario-docs/index.js";

type ScenarioDocLike = { id: string; appAreaDocIds?: readonly string[] | null };
let moduleScenarioDocs: ScenarioDocLike[] = [];

const moduleIndexPath = path.resolve(
  import.meta.dirname,
  "../../src/scenario-docs/meadow-extension/index.ts",
);
if (existsSync(moduleIndexPath)) {
  const moduleDocs = await import(pathToFileURL(moduleIndexPath).href) as {
    meadowExtensionDocs?: ScenarioDocLike[];
  };
  moduleScenarioDocs = moduleDocs.meadowExtensionDocs ?? [];
}

const errors = findScenarioDocAppAreaAssignmentErrors({
  baseScenarioDocs,
  moduleScenarioDocs,
  appAreaDocs: allAppAreaDocs,
  baseAssignments: scenarioDocToAppAreaIds,
});

if (errors.length > 0) {
  console.error("E2E scenario app-area ownership failed:\n");
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

console.log(
  `Scenario app-area ownership passed: ${baseScenarioDocs.length} base, ${moduleScenarioDocs.length} module.`,
);
