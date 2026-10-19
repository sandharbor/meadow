/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { conceptLinks, renderConceptText, type AnyMeadowConcept, type ConceptText, type MeadowConceptKind } from './types.js';

/** The captured concept-link encoding remains readable in historical reports. */
export type DocumentText<Id extends string = string> = ConceptText<Id>;
export type DocumentBlock<Id extends string = string> =
  | { readonly kind: 'paragraph'; readonly text: DocumentText<Id> }
  | { readonly kind: 'list'; readonly items: readonly DocumentText<Id>[] };
export interface DocumentSection<Id extends string = string> {
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly DocumentBlock<Id>[];
}
export type DocumentKind = 'concept' | 'design-pressure' | 'fixture' | 'scenario' | 'code-boundary';

/** Common reading surface. Each authoring schema keeps its own required fields. */
export interface MeadowDocument<Id extends string = string, KnownId extends string = string> {
  readonly id: Id;
  readonly name: string;
  readonly semanticTitle?: DocumentText<KnownId>;
  readonly documentKind: DocumentKind;
  readonly description: DocumentText<KnownId>;
  readonly sections: readonly DocumentSection<KnownId>[];
  readonly aliases?: readonly string[];
  readonly appAreaIds?: readonly KnownId[];
  readonly subAreas?: readonly { readonly areaId: KnownId; readonly order: number }[];
  readonly parentId?: KnownId;
  readonly kind?: MeadowConceptKind;
  readonly searchFacet?: boolean;
  readonly implementationRoles?: readonly string[];
}

export type DesignPressure<Id extends string = string, KnownId extends string = string> =
  MeadowDocument<Id, KnownId> & { readonly documentKind: 'design-pressure' };

export interface DocumentPassage {
  sectionId: string;
  heading: string;
  blockIndex: number;
  itemIndex?: number;
  text: DocumentText;
}

export function documentPassages(document: MeadowDocument): DocumentPassage[] {
  return [
    ...(document.semanticTitle !== undefined ? [{ sectionId: 'semantic-title', heading: 'AKA', blockIndex: 0, text: document.semanticTitle }] : []),
    { sectionId: 'description', heading: 'Description', blockIndex: 0, text: document.description },
    ...document.sections.flatMap(section => section.blocks.flatMap((block, blockIndex): DocumentPassage[] =>
      block.kind === 'paragraph'
        ? [{ sectionId: section.id, heading: section.heading, blockIndex, text: block.text }]
        : block.items.map((text, itemIndex) => ({ sectionId: section.id, heading: section.heading, blockIndex, itemIndex, text })))),
  ];
}

export function documentTextFromString(text: string): DocumentText {
  return { segments: [{ kind: 'text', text }] };
}

/** Concept values and their type-only implementation identities stay authoritative. */
export function conceptDocument(concept: AnyMeadowConcept): MeadowDocument {
  const { definition, mechanics, interplay, ...metadata } = concept;
  return { ...metadata, documentKind: 'concept', description: definition, sections: [
    { id: 'mechanics', heading: 'Mechanics', blocks: [{ kind: 'list', items: mechanics }] },
    { id: 'interplay', heading: 'Interplay', blocks: [{ kind: 'paragraph', text: interplay }] },
  ] };
}

export function fixtureDocument(fixture: { id: string; name: string; description: string | DocumentText; semanticTitle?: DocumentText }): MeadowDocument {
  return { id: fixture.id, name: fixture.name, ...(fixture.semanticTitle !== undefined && { semanticTitle: fixture.semanticTitle }), documentKind: 'fixture',
    description: typeof fixture.description === 'string' ? documentTextFromString(fixture.description) : fixture.description, sections: [] };
}

export interface DocumentBacklink extends DocumentPassage { documentId: string; documentName: string }
export function documentBacklinks(id: string, documents: readonly MeadowDocument[]): DocumentBacklink[] {
  return documents.filter(document => document.id !== id).flatMap(document => documentPassages(document)
    .filter(passage => conceptLinks(passage.text).some(link => link.conceptId === id))
    .map(passage => ({ ...passage, documentId: document.id, documentName: document.name })));
}

export function relatedDocumentIds(document: MeadowDocument, documents: readonly MeadowDocument[]): string[] {
  return [...new Set([
    ...documentPassages(document).flatMap(passage => conceptLinks(passage.text).map(link => link.conceptId)),
    ...(document.appAreaIds ?? []), ...(document.parentId ? [document.parentId] : []),
    ...documentBacklinks(document.id, documents).map(link => link.documentId),
    ...documents.filter(candidate => candidate.parentId === document.id || candidate.appAreaIds?.includes(document.id)).map(candidate => candidate.id),
  ])].filter(id => id !== document.id);
}

const requiredSections: Record<DocumentKind, readonly string[]> = {
  concept: ['mechanics', 'interplay'], 'design-pressure': ['motivation', 'response', 'tradeoffs'], fixture: [], scenario: [], 'code-boundary': [],
};

export function validateDocuments(documents: readonly MeadowDocument[]): string[] {
  const errors: string[] = [];
  const ids = new Map<string, MeadowDocument>();
  const names = new Map<string, string>();
  for (const document of documents) {
    if (!document || typeof document.id !== 'string' || !document.id.trim()) { errors.push('Document has no stable ID.'); continue; }
    if (ids.has(document.id)) errors.push(`Document ID "${document.id}" is declared more than once.`);
    ids.set(document.id, document);
    if (typeof document.name !== 'string' || !document.name.trim()) errors.push(`Document "${document.id}" has no name.`);
    for (const name of [document.name, ...(document.aliases ?? [])]) {
      const key = typeof name === 'string' ? name.trim().toLocaleLowerCase() : '';
      if (!key) errors.push(`Document "${document.id}" has an empty name or alias.`);
      else if (names.has(key) && names.get(key) !== document.id) errors.push(`Document name or alias "${name}" belongs to both "${names.get(key)}" and "${document.id}".`);
      else names.set(key, document.id);
    }
  }
  for (const document of documents) {
    if (!document || !document.id) continue;
    if (!Object.prototype.hasOwnProperty.call(requiredSections, document.documentKind) || !Array.isArray(document.sections)) {
      errors.push(`Document "${document.id}" has an invalid schema.`); continue;
    }
    const sections = new Set<string>();
    let validBlocks = true;
    for (const section of document.sections) {
      if (!section || !section.id || !section.heading?.trim() || !Array.isArray(section.blocks)) {
        errors.push(`Document "${document.id}" has an invalid section.`); validBlocks = false; continue;
      }
      if (sections.has(section.id) || ['description', 'semantic-title'].includes(section.id)) errors.push(`Document "${document.id}" repeats section "${section.id}".`);
      sections.add(section.id);
      if (!section.blocks.length) errors.push(`Document "${document.id}" has empty section "${section.id}".`);
      for (const block of section.blocks) if (!block || (block.kind !== 'paragraph' && block.kind !== 'list')
        || (block.kind === 'list' && (!Array.isArray(block.items) || !block.items.length))) {
        errors.push(`Document "${document.id}" has an invalid block.`); validBlocks = false;
      }
    }
    for (const section of requiredSections[document.documentKind]) if (!sections.has(section)) errors.push(`Document "${document.id}" requires section "${section}".`);
    if (validBlocks) for (const passage of documentPassages(document)) {
      if (!passage.text || !Array.isArray(passage.text.segments) || passage.text.segments.some(segment => !segment
        || (segment.kind === 'text' ? typeof segment.text !== 'string'
          : segment.kind !== 'concept-link' || typeof segment.conceptId !== 'string' || typeof segment.label !== 'string'))) {
        errors.push(`Document "${document.id}" has invalid text in "${passage.sectionId}".`); continue;
      }
      if (!renderConceptText(passage.text)) errors.push(`Document "${document.id}" has empty text in "${passage.sectionId}".`);
      for (const link of conceptLinks(passage.text)) if (!ids.has(link.conceptId)) errors.push(`Document "${document.id}" references unknown document "${link.conceptId}".`);
    }
    for (const area of document.appAreaIds ?? []) if (ids.get(area)?.kind !== 'app-area') errors.push(`Document "${document.id}" has invalid app area "${area}".`);
    if (document.parentId && !ids.has(document.parentId)) errors.push(`Document "${document.id}" has unknown parent "${document.parentId}".`);
  }
  return errors;
}

export function assertDocumentRegistry(documents: readonly MeadowDocument[]): void {
  const errors = validateDocuments(documents);
  if (errors.length) throw new Error(`Invalid document registry:\n- ${errors.join('\n- ')}`);
}
