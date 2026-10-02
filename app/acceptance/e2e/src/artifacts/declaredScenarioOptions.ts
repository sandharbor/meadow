/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import ts from "typescript";
import { isBundleMode, type BundleMode } from "../run/bundleMode.js";
import { isExecutionSurface, type ExecutionSurface } from "../run/executionSurface.js";

/** Literal, file-level options remain reviewable when a skipped test runs no fixtures. */
export function declaredScenarioOptions(source: string): {
  bundleMode?: BundleMode;
  executionSurface?: ExecutionSurface;
  executionSurfaces?: ExecutionSurface[];
} {
  const options: ReturnType<typeof declaredScenarioOptions> = {};
  const file = ts.createSourceFile("scenario.ts", source, ts.ScriptTarget.Latest, true);
  for (const statement of file.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const call = statement.expression;
    const target = call.expression;
    if (!ts.isPropertyAccessExpression(target) || !ts.isIdentifier(target.expression)
      || target.expression.text !== "test" || target.name.text !== "use") continue;
    const argument = call.arguments[0];
    if (!argument || !ts.isObjectLiteralExpression(argument)) continue;
    for (const property of argument.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = property.name;
      if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) continue;
      const value = property.initializer;
      if (name.text === "bundleMode" && ts.isStringLiteral(value) && isBundleMode(value.text)) {
        options.bundleMode = value.text;
      }
      if (name.text === "executionSurface" && ts.isStringLiteral(value) && isExecutionSurface(value.text)) {
        options.executionSurface = value.text;
      }
      if (name.text === "executionSurfaces" && ts.isArrayLiteralExpression(value)) {
        const surfaces = value.elements.map(element => ts.isStringLiteral(element) ? element.text : null);
        if (surfaces.length && surfaces.every(isExecutionSurface)) options.executionSurfaces = surfaces;
      }
    }
  }
  return options;
}
