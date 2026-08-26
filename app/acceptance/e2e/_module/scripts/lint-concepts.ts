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
import {
  allCoreConcepts,
  appAreaConcepts,
  assertConceptRegistry,
  type AnyMeadowConcept,
} from "../../../../concepts/index.js";

let contributedConcepts: AnyMeadowConcept[] = [];
const contributionPath = path.resolve(
  import.meta.dirname,
  "../../../../concepts/meadow-extension/index.ts",
);
if (existsSync(contributionPath)) {
  const contribution = await import(pathToFileURL(contributionPath).href) as {
    meadowExtensionConcepts?: AnyMeadowConcept[];
  };
  contributedConcepts = contribution.meadowExtensionConcepts ?? [];
}

assertConceptRegistry([...allCoreConcepts, ...contributedConcepts]);

console.log(
  `Concept registry passed: ${allCoreConcepts.length} core, ${contributedConcepts.length} contributed, ${appAreaConcepts.length} app areas.`,
);
