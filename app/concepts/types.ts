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

export const MEADOW_CONCEPT_KINDS = [
  "app-area",
  "entity",
  "service",
  "artifact",
  "process",
  "role",
  "interface",
  "mechanism",
  "state",
  "capability",
] as const;

export type MeadowConceptKind = typeof MEADOW_CONCEPT_KINDS[number];

export interface ConceptLink<Id extends string = string> {
  readonly kind: "concept-link";
  readonly conceptId: Id;
  readonly label: string;
}

export interface ConceptTextSegment {
  readonly kind: "text";
  readonly text: string;
}

export interface ConceptText<Id extends string = string> {
  readonly segments: readonly (ConceptTextSegment | ConceptLink<Id>)[];
}

export interface MeadowConcept<
  Id extends string = string,
  KnownId extends string = string,
  Roles extends readonly string[] = readonly string[],
> {
  readonly id: Id;
  readonly name: string;
  readonly kind: MeadowConceptKind;
  readonly aliases?: readonly string[];
  readonly definition: ConceptText<KnownId>;
  readonly mechanics: readonly ConceptText<KnownId>[];
  readonly interplay: ConceptText<KnownId>;
  readonly appAreaIds?: readonly KnownId[];
  readonly parentId?: KnownId;
  readonly implementationRoles?: Roles;
}

export type AnyMeadowConcept = MeadowConcept<string, string, readonly string[]>;

export type ImplementationRoleOf<Concept extends AnyMeadowConcept> =
  NonNullable<Concept["implementationRoles"]>[number];

/**
 * Compile-only metadata embedded in implementation files. The third type
 * argument deliberately names the participating symbol so renames and removals
 * are checked by TypeScript. This type emits no JavaScript.
 */
export type ParticipatesIn<
  Concept extends AnyMeadowConcept,
  Role extends ImplementationRoleOf<Concept>,
  Participant,
> = {
  readonly conceptId: Concept["id"];
  readonly role: Role;
  readonly participant: Participant;
};

export function createConceptLanguage<KnownId extends string>() {
  function conceptLink<TargetId extends KnownId>(conceptId: TargetId, label: string): ConceptLink<TargetId> {
    return { kind: "concept-link", conceptId, label };
  }

  function conceptText(
    strings: TemplateStringsArray,
    ...links: readonly ConceptLink<KnownId>[]
  ): ConceptText<KnownId> {
    const segments: (ConceptTextSegment | ConceptLink<KnownId>)[] = [];
    strings.forEach((text, index) => {
      if (text) segments.push({ kind: "text", text });
      const link = links[index];
      if (link) segments.push(link);
    });
    return { segments };
  }

  function defineMeadowConcept<
    const Id extends KnownId,
    const Roles extends readonly string[] = readonly [],
  >(concept: MeadowConcept<Id, KnownId, Roles>): MeadowConcept<Id, KnownId, Roles> {
    return concept;
  }

  return { conceptLink, conceptText, defineMeadowConcept };
}

export function conceptLinks<Id extends string>(text: ConceptText<Id>): ConceptLink<Id>[] {
  return text.segments.filter((segment): segment is ConceptLink<Id> => segment.kind === "concept-link");
}

export function renderConceptText(
  text: ConceptText,
  conceptNames: ReadonlyMap<string, string> = new Map(),
): string {
  return text.segments.map(segment => (
    segment.kind === "text"
      ? segment.text
      : segment.label || conceptNames.get(segment.conceptId) || segment.conceptId
  )).join("").replace(/\s+/g, " ").trim();
}
