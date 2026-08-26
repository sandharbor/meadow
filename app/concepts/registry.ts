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
  conceptLinks,
  renderConceptText,
  type AnyMeadowConcept,
  type ConceptText,
} from "./types.js";

function textsFor(concept: AnyMeadowConcept): ConceptText[] {
  return [concept.definition, ...concept.mechanics, concept.interplay];
}

export function validateConceptRegistry(concepts: readonly AnyMeadowConcept[]): string[] {
  const errors: string[] = [];
  const byId = new Map<string, AnyMeadowConcept>();
  const names = new Map<string, string>();

  for (const concept of concepts) {
    if (byId.has(concept.id)) errors.push(`concept id "${concept.id}" is declared more than once`);
    byId.set(concept.id, concept);

    if (!concept.name.trim()) errors.push(`concept "${concept.id}" has no name`);
    if (!renderConceptText(concept.definition)) errors.push(`concept "${concept.id}" has no definition`);
    if (concept.mechanics.length === 0 || concept.mechanics.some(item => !renderConceptText(item))) {
      errors.push(`concept "${concept.id}" must have non-empty mechanics`);
    }
    if (!renderConceptText(concept.interplay)) errors.push(`concept "${concept.id}" has no interplay`);

    for (const alias of [concept.name, ...(concept.aliases ?? [])]) {
      const normalized = alias.trim().toLocaleLowerCase();
      const owner = names.get(normalized);
      if (!normalized) errors.push(`concept "${concept.id}" has an empty name or alias`);
      else if (owner && owner !== concept.id) {
        errors.push(`concept alias "${alias}" belongs to both "${owner}" and "${concept.id}"`);
      } else names.set(normalized, concept.id);
    }
  }

  for (const concept of concepts) {
    const referencedIds = [
      ...textsFor(concept).flatMap(text => conceptLinks(text).map(link => link.conceptId)),
      ...(concept.appAreaIds ?? []),
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
  const related = new Set<string>();
  for (const text of textsFor(concept)) {
    for (const link of conceptLinks(text)) related.add(link.conceptId);
  }
  for (const id of concept.appAreaIds ?? []) related.add(id);
  if (concept.parentId) related.add(concept.parentId);

  for (const candidate of concepts) {
    if (candidate.id === concept.id) continue;
    const candidateReferences = [
      ...textsFor(candidate).flatMap(text => conceptLinks(text).map(link => link.conceptId)),
      ...(candidate.appAreaIds ?? []),
      ...(candidate.parentId ? [candidate.parentId] : []),
    ];
    if (candidateReferences.includes(concept.id)) related.add(candidate.id);
  }

  return [...related];
}
