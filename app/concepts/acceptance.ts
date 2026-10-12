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

import { renderConceptText, type ConceptText, type AnyMeadowConcept } from "./types.js";
import type { acceptanceAppAreaConcepts } from "./bundle/appAreas.js";
import { conceptDocument, type DesignPressure, type MeadowDocument } from './documents.js';

/** The acceptance/report projection of a canonical concept. */
export interface AcceptanceConceptView {
  readonly id: string;
  readonly name: string;
  readonly searchFacet: boolean;
  readonly subAreas?: readonly { readonly areaId: string; readonly order: number }[];
  readonly parentId?: string;
  readonly kind?: string;
  readonly description: string;
  readonly appAreaIds: readonly string[] | null;
}

export function acceptanceConceptView(concept: AnyMeadowConcept): AcceptanceConceptView {
  return {
    id: concept.id,
    name: concept.name,
    searchFacet: concept.searchFacet === true,
    subAreas: concept.subAreas,
    parentId: concept.parentId,
    kind: concept.kind,
    description: [concept.definition, ...(concept.kind === "behavioral-rule" ? concept.mechanics : [])].map(text => renderConceptText(text)).join("\n\n"),
    appAreaIds: concept.appAreaIds ?? null,
  };
}

/** Shared document projection, retaining plain summaries for existing report readers. */
export function acceptanceDocumentView(document: MeadowDocument) {
  return { ...document, descriptionText: document.description, description: renderConceptText(document.description), searchFacet: document.searchFacet === true };
}

export function conceptDocumentView(concept: AnyMeadowConcept) {
  return acceptanceDocumentView(conceptDocument(concept));
}

/** Explicit examples of a design pressure; imports alone never declare this relation. */
export function scenarioDesignPressures(pressures: readonly DesignPressure[]) {
  const ids = pressures.map(pressure => pressure.id);
  if (new Set(ids).size !== ids.length) throw new Error('A scenario lists a design pressure more than once.');
  return { ids, annotation: { type: 'scenario-design-pressures', description: JSON.stringify(ids) } };
}

type ScenarioAppArea = { readonly id: (typeof acceptanceAppAreaConcepts)[number]["id"] };

/**
 * Declare the app areas and sub-areas a scenario exercises. Reports use only this
 * declaration; concepts linked by the scenario never contribute their areas.
 */
export function scenarioAreas(
  appAreas: readonly ScenarioAppArea[],
  options: { readonly subAreas?: readonly AnyMeadowConcept[] } = {},
) {
  const appAreaIds = appAreas.map(area => area.id);
  const subAreaIds = (options.subAreas ?? []).map(subArea => {
    if (!subArea.subAreas?.some(entry => (appAreaIds as readonly string[]).includes(entry.areaId))) {
      throw new Error(`${subArea.name} is not a sub-area of a declared app area.`);
    }
    return subArea.id;
  });
  return { appAreaIds, subAreaIds, annotation: { type: 'scenario-areas', description: JSON.stringify({ appAreaIds, subAreaIds }) } };
}

/** Capture linked scenario prose while retaining Playwright's plain-text name and stable slug. */
export function linkedScenarioName(nameText: ConceptText) {
  return { name: renderConceptText(nameText), annotation: { type: 'scenario-name', description: JSON.stringify(nameText) } };
}

/** Formal scenario prose, captured with its checked concept references. */
export function linkedScenarioDescription(descriptionText: ConceptText) {
  return { description: renderConceptText(descriptionText), annotation: { type: 'scenario-description', description: JSON.stringify(descriptionText) } };
}
