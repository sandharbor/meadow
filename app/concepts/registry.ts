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

import {
  type AnyMeadowConcept,
} from "./types.js";
import { conceptDocument, relatedDocumentIds, validateDocuments } from './documents.js';
import { designPressures } from './designPressures.js';

export function validateConceptRegistry(concepts: readonly AnyMeadowConcept[]): string[] {
  const errors = validateDocuments([...concepts.map(conceptDocument), ...designPressures]);
  const byId = new Map<string, AnyMeadowConcept>();

  for (const concept of concepts) {
    byId.set(concept.id, concept);
  }

  for (const concept of concepts) {
    const referencedIds = [
      ...(concept.appAreaIds ?? []),
      ...(concept.subAreas ?? []).map(subArea => subArea.areaId),
      ...(concept.parentId ? [concept.parentId] : []),
    ];
    for (const referencedId of referencedIds) {
      if (!byId.has(referencedId)) {
        errors.push(`concept "${concept.id}" references unknown concept "${referencedId}"`);
      }
    }
    for (const appAreaId of concept.appAreaIds ?? []) {
      if (byId.get(appAreaId)?.kind !== "app-area") {
        errors.push(`concept "${concept.id}" has non-app-area membership "${appAreaId}"`);
      }
    }
    for (const subArea of concept.subAreas ?? []) {
      if (byId.get(subArea.areaId)?.kind !== "app-area" || !concept.appAreaIds?.includes(subArea.areaId)) {
        errors.push(`concept "${concept.id}" has invalid sub-area membership "${subArea.areaId}"`);
      }
      if (!Number.isFinite(subArea.order) || subArea.order < 0) {
        errors.push(`concept "${concept.id}" has invalid sub-area order`);
      }
    }
    if (concept.kind === "app-area" && concept.appAreaIds?.length) {
      errors.push(`app-area concept "${concept.id}" must use parentId rather than appAreaIds`);
    }
  }

  return errors;
}

export function assertConceptRegistry(concepts: readonly AnyMeadowConcept[]): void {
  const errors = validateConceptRegistry(concepts);
  if (errors.length > 0) throw new Error(`Invalid MeadowConcept registry:\n- ${errors.join("\n- ")}`);
}

export function conceptMap(concepts: readonly AnyMeadowConcept[]): ReadonlyMap<string, AnyMeadowConcept> {
  return new Map(concepts.map(concept => [concept.id, concept]));
}

export function relatedConceptIds(
  concept: AnyMeadowConcept,
  concepts: readonly AnyMeadowConcept[],
): string[] {
  return relatedDocumentIds(conceptDocument(concept), [...concepts.map(conceptDocument), ...designPressures]);
}
