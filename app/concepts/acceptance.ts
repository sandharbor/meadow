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

import { renderConceptText, type AnyMeadowConcept } from "./types.js";

/** The acceptance/report projection of a canonical concept. */
export interface AcceptanceConceptView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly appAreaIds: readonly string[] | null;
}

export function acceptanceConceptView(concept: AnyMeadowConcept): AcceptanceConceptView {
  return {
    id: concept.id,
    name: concept.name,
    description: renderConceptText(concept.definition),
    appAreaIds: concept.appAreaIds ?? null,
  };
}

export function deriveAppAreaIds(
  conceptIds: readonly string[],
  concepts: readonly AnyMeadowConcept[],
  appAreas: readonly AnyMeadowConcept[],
  explicitAppAreaIds: readonly string[] = [],
): string[] {
  const byId = new Map(concepts.map(concept => [concept.id, concept]));
  const ids = new Set(explicitAppAreaIds);
  for (const conceptId of conceptIds) {
    for (const appAreaId of byId.get(conceptId)?.appAreaIds ?? []) ids.add(appAreaId);
  }
  return appAreas.map(area => area.id).filter(id => ids.has(id));
}
