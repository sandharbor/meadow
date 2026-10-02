/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import ts from 'typescript';

/** Hide simple capture wrappers while preserving every captured line number. */
export function testSourceDisplay(source: string): { source: string; commandLines: number[] } {
  const ast = ts.createSourceFile('scenario.ts', source, ts.ScriptTarget.Latest, true);
  const edits: { start: number; end: number }[] = [];
  const commandLines: number[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'sourceCommand') {
      const callback = node.arguments[0];
      if (node.arguments.length === 1 && callback && ts.isArrowFunction(callback) && callback.parameters.length === 0 && !ts.isBlock(callback.body)) {
        commandLines.push(ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1);
        edits.push({ start: node.getStart(ast), end: callback.body.getStart(ast) });
        edits.push({ start: callback.body.getEnd(), end: node.getEnd() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  for (const { start, end } of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, start) + source.slice(start, end).replace(/[^\r\n]/g, '') + source.slice(end);
  }
  return { source, commandLines: [...new Set(commandLines)] };
}
