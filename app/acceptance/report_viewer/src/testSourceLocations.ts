/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import ts from 'typescript';

export interface TestSourceLocations {
  testLine: number | null;
  checkpoints: { message: string; line: number }[];
}

/** Resolve captured calls without depending on quote style or string escaping. */
export function testSourceLocations(source: string): TestSourceLocations {
  const ast = ts.createSourceFile('scenario.ts', source, ts.ScriptTarget.Latest, true);
  const locations: TestSourceLocations = { testLine: null, checkpoints: [] };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      if (node.expression.text === 'test') locations.testLine ??= line;
      const message = node.arguments[0];
      // Runs recorded before the checkpoint rename called snapshot().
      if (['checkpoint', 'snapshot'].includes(node.expression.text) && message && ts.isStringLiteralLike(message)) {
        locations.checkpoints.push({ message: message.text, line });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return locations;
}
