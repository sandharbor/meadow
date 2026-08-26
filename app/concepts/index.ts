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

export * from "./types.js";
export * from "./ids.js";
export * from "./language.js";
export * from "./registry.js";
export * from "./acceptance.js";

export * from "./bundle/appAreas.js";
export * from "./bundle/bundles/concepts.js";
export * from "./bundle/curation/concepts.js";
export * from "./bundle/generation/concepts.js";
export * from "./bundle/review/concepts.js";
export * from "./bundle/sharing/concepts.js";
export * from "./application/concepts.js";
export * from "./runtime/concepts.js";

import { applicationConcepts } from "./application/concepts.js";
import { appAreaConcepts } from "./bundle/appAreas.js";
import { bundleCollectionConcepts } from "./bundle/bundles/concepts.js";
import { curationConcepts } from "./bundle/curation/concepts.js";
import { generationConcepts } from "./bundle/generation/concepts.js";
import { reviewConcepts } from "./bundle/review/concepts.js";
import { sharingConcepts } from "./bundle/sharing/concepts.js";
import { assertConceptRegistry } from "./registry.js";
import { runtimeOwnershipConcepts } from "./runtime/concepts.js";
import type { AnyMeadowConcept } from "./types.js";

export const acceptanceConcepts = [
  ...bundleCollectionConcepts,
  ...curationConcepts,
  ...generationConcepts,
  ...reviewConcepts,
  ...sharingConcepts,
  ...applicationConcepts,
] as const satisfies readonly AnyMeadowConcept[];

export const allCoreConcepts = [
  ...appAreaConcepts,
  ...acceptanceConcepts,
  ...runtimeOwnershipConcepts,
] as const satisfies readonly AnyMeadowConcept[];

assertConceptRegistry(allCoreConcepts);
