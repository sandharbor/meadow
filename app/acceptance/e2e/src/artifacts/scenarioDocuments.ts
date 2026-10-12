/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import ts from 'typescript';
import { declaredScenarioAreaIds } from './declaredScenarioAreas.js';
import type { DocumentRegistry } from '../../../../concepts/loadRegistry.js';

export interface ScenarioDocuments {
  conceptIds: string[];
  bundleDocIds: string[];
  appAreaDocIds: string[];
  subAreaDocIds: string[];
  /** Undefined means a historical run did not capture this relation. */
  designPressureIds?: string[];
}

function importedNames(file: ts.SourceFile) {
  const imports = new Map<string, string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || !/\/(concepts|bundle-docs)\//.test(statement.moduleSpecifier.text) || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements) {
      if (!entry.isTypeOnly) imports.set(entry.name.text, entry.propertyName?.text ?? entry.name.text);
    }
  }
  return imports;
}

/** Literal declarations are shared by linting, skipped tests, and run capture. */
export function declaredScenarioPressures(source: string | ts.SourceFile): string[] | undefined {
  const file = typeof source === 'string' ? ts.createSourceFile('scenario.ts', source, ts.ScriptTarget.Latest, true) : source;
  const imports = importedNames(file);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const call = declaration.initializer;
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'pressures' || !call
        || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)
        || imports.get(call.expression.text) !== 'scenarioDesignPressures') continue;
      const list = call.arguments[0];
      if (call.arguments.length !== 1 || !list || !ts.isArrayLiteralExpression(list)
        || list.elements.some(element => !ts.isIdentifier(element) || !imports.has(element.text))) {
        throw new Error('scenarioDesignPressures requires a literal list of imported design pressures.');
      }
      return list.elements.map(element => imports.get((element as ts.Identifier).text)!);
    }
  }
  return undefined;
}

export function resolveScenarioDocuments(source: string, registry: DocumentRegistry): ScenarioDocuments {
  const file = ts.createSourceFile('scenario.ts', source, ts.ScriptTarget.Latest, true);
  const importedIds = [...new Set([...importedNames(file).values()].flatMap(name => registry.exportNameToId.get(name) ?? []))];
  const pressureNames = declaredScenarioPressures(file) ?? [];
  const designPressureIds = pressureNames.map(name => {
    const id = registry.exportNameToId.get(name);
    if (!id || !registry.pressureIds.includes(id)) throw new Error(`${name} is not a design pressure.`);
    return id;
  });
  if (new Set(designPressureIds).size !== designPressureIds.length) throw new Error('Duplicate scenario design pressure.');
  const areas = declaredScenarioAreaIds(source, registry.exportNameToId);
  return {
    conceptIds: importedIds.filter(id => registry.acceptanceConcepts.some(concept => concept.id === id)),
    bundleDocIds: importedIds.filter(id => registry.fixtureIds.includes(id)),
    appAreaDocIds: areas.appAreaIds, subAreaDocIds: areas.subAreaIds, designPressureIds,
  };
}
