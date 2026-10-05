/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import ts from 'typescript';

// Generic value assertions are synchronous. Locator assertions, polling, and
// promise assertions still need their await after capture code is hidden.
const synchronousMatchers = new Set([
  'toBe', 'toBeCloseTo', 'toBeDefined', 'toBeFalsy', 'toBeGreaterThan',
  'toBeGreaterThanOrEqual', 'toBeInstanceOf', 'toBeLessThan', 'toBeLessThanOrEqual',
  'toBeNaN', 'toBeNull', 'toBeTruthy', 'toBeUndefined', 'toContain', 'toContainEqual',
  'toEqual', 'toHaveLength', 'toHaveProperty', 'toMatch', 'toMatchObject',
  'toStrictEqual', 'toThrow', 'toThrowError',
]);

function needsCaptureAwait(expression: ts.Expression): boolean {
  while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
  if (ts.isAwaitExpression(expression)) return false;
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) return true;
  const matcher = expression.expression;
  if (ts.isIdentifier(matcher.expression)) {
    const receiver = matcher.expression.text;
    if (receiver === 'fs' && matcher.name.text.endsWith('Sync')) return false;
    if (['JSON', 'YAML'].includes(receiver) && ['parse', 'stringify'].includes(matcher.name.text)) return false;
  }
  if (!synchronousMatchers.has(matcher.name.text)) return true;
  let receiver = matcher.expression;
  while (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'not') receiver = receiver.expression;
  if (!ts.isCallExpression(receiver)) return true;
  const expect = receiver.expression;
  return !(ts.isIdentifier(expect) && expect.text === 'expect'
    || ts.isPropertyAccessExpression(expect) && ts.isIdentifier(expect.expression)
      && expect.expression.text === 'expect' && expect.name.text === 'soft');
}

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
        const start = ts.isAwaitExpression(node.parent) && !needsCaptureAwait(callback.body)
          ? node.parent.getStart(ast) : node.getStart(ast);
        edits.push({ start, end: callback.body.getStart(ast) });
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
