/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import ts from "typescript";

export interface DeclaredScenarioAreas {
  /** Concept export names, with import aliases resolved. */
  readonly appAreas: readonly string[];
  readonly subAreas: readonly string[];
}

/**
 * Read `const areas = scenarioAreas([...], { subAreas: [...] })` without running
 * the spec, so filtering and assembly use the scenario's own declaration.
 */
export function declaredScenarioAreas(source: string | ts.SourceFile): DeclaredScenarioAreas | undefined {
  const file = typeof source === "string" ? ts.createSourceFile("scenario.ts", source, ts.ScriptTarget.Latest, true) : source;
  const imports = new Map<string, string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || !statement.moduleSpecifier.text.endsWith("/concepts/index.js")) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements) {
      imports.set(entry.name.text, entry.propertyName?.text ?? entry.name.text);
    }
  }
  const names = (node: ts.Expression | undefined) => node && ts.isArrayLiteralExpression(node)
    ? node.elements.map(element => ts.isIdentifier(element) ? imports.get(element.text) ?? element.text : element.getText(file))
    : [];
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const call = declaration.initializer;
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "areas" || !call || !ts.isCallExpression(call)
        || !ts.isIdentifier(call.expression) || imports.get(call.expression.text) !== "scenarioAreas") continue;
      const options = call.arguments[1];
      const subAreas = options && ts.isObjectLiteralExpression(options)
        ? options.properties.find((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && property.name.getText(file) === "subAreas")?.initializer
        : undefined;
      return { appAreas: names(call.arguments[0]), subAreas: names(subAreas) };
    }
  }
  return undefined;
}

/** Resolve a scenario's declared areas to concept ids; an undeclared scenario has none. */
export function declaredScenarioAreaIds(source: string, conceptIdOf: ReadonlyMap<string, string>) {
  const declared = declaredScenarioAreas(source);
  const ids = (names: readonly string[] = []) => names.flatMap(name => conceptIdOf.get(name) ?? []);
  return { appAreaIds: ids(declared?.appAreas), subAreaIds: ids(declared?.subAreas) };
}
