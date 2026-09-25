/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { loadSourceChanges } from '../../../../shared_code/shared_dev/sourceChanges.js';
import type { SourceChangeDefinition } from '../../../../shared_code/shared_dev/sourceChangesTypes.js';

interface SourceChangeReference {
  id: string;
  sourceGraph?: string;
  /** Zero-based line containing the end of the source-change call. */
  line: number;
}

export interface TestSourceChange extends SourceChangeReference {
  definition: SourceChangeDefinition | null;
  origin: 'run' | 'checkout';
}

export function extractSourceChangeReferences(source: string): SourceChangeReference[] {
  const file = ts.createSourceFile('scenario.ts', source, ts.ScriptTarget.Latest, true);
  const references: SourceChangeReference[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'sourceChanges'
      && node.expression.name.text === 'apply') {
      const [id, graph] = node.arguments;
      if (id && ts.isStringLiteralLike(id) && (!graph || ts.isStringLiteralLike(graph))) {
        references.push({ id: id.text, ...(graph && { sourceGraph: graph.text }), line: file.getLineAndCharacterOfPosition(node.end).line });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return references;
}

function matchingDefinition(reference: SourceChangeReference, definitions: SourceChangeDefinition[]): SourceChangeDefinition | null {
  const matches = definitions.filter(change => change.id === reference.id && (!reference.sourceGraph || change.sourceGraph === reference.sourceGraph));
  // An ambiguous reference should never show an unrelated change's explanation.
  return matches.length === 1 ? matches[0] : null;
}

export function collectReferencedSourceChanges(source: string, projectRoot = path.resolve(import.meta.dirname, '../../../../..')): SourceChangeDefinition[] {
  const references = extractSourceChangeReferences(source);
  const directory = path.join(projectRoot, 'app/shared_data/source_changes');
  if (!references.length || !existsSync(directory)) return [];
  const definitions = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry => loadSourceChanges(projectRoot, entry.name));
  return [...new Set(references.map(reference => matchingDefinition(reference, definitions)))]
    .filter((definition): definition is SourceChangeDefinition => definition !== null);
}

export function describeTestSourceChanges(source: string, captured?: SourceChangeDefinition[]): TestSourceChange[] {
  const definitions = captured ?? collectReferencedSourceChanges(source);
  return extractSourceChangeReferences(source).map(reference => ({
    ...reference,
    definition: matchingDefinition(reference, definitions),
    origin: captured === undefined ? 'checkout' : 'run',
  }));
}
