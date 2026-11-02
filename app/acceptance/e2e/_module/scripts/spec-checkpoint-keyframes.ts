/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import ts from 'typescript';

export interface CheckpointKeyFrameIssue { line: number; column: number; message: string }

/** Find adjacent captures that should share their checkpoint's image and identity. */
export function auditCheckpointKeyFrames(text: string, filename = 'scenario.spec.ts'): CheckpointKeyFrameIssue[] {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const issues: CheckpointKeyFrameIssue[] = [];
  const names = new Map<string, string>([
    ['addKeyFrame', 'addKeyFrame'], ['checkpoint', 'checkpoint'], ['sourceCommand', 'sourceCommand'],
  ]);

  // Fixtures may be destructured under local names in a scenario or helper.
  function collectAliases(node: ts.Node): void {
    if (ts.isBindingElement(node) && node.propertyName && ts.isIdentifier(node.propertyName) && ts.isIdentifier(node.name)) {
      const name = names.get(node.propertyName.text);
      if (name) names.set(node.name.text, name);
    }
    ts.forEachChild(node, collectAliases);
  }
  collectAliases(source);

  function callIn(node: ts.Node): ts.CallExpression | undefined {
    if (ts.isExpressionStatement(node) || ts.isAwaitExpression(node) || ts.isParenthesizedExpression(node)
      || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) return callIn(node.expression);
    if (ts.isReturnStatement(node)) return node.expression && callIn(node.expression);
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return callIn(node.body);
    if (ts.isBlock(node)) return node.statements.length === 1 ? callIn(node.statements[0]) : undefined;
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return undefined;
    const name = names.get(node.expression.text);
    if (name === 'sourceCommand' && node.arguments.length === 1) return callIn(node.arguments[0]);
    return name === 'checkpoint' || name === 'addKeyFrame' ? node : undefined;
  }

  // Only adjacent statements in the same execution block qualify. Never merge
  // across an assertion, UI action, branch, loop, or scenario-section boundary.
  function walk(node: ts.Node): void {
    if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isCaseClause(node) || ts.isDefaultClause(node)) {
      let pending: ts.CallExpression[] = [];
      for (const statement of node.statements) {
        const call = callIn(statement);
        const name = call && ts.isIdentifier(call.expression) ? names.get(call.expression.text) : undefined;
        if (name === 'addKeyFrame') {
          pending.push(call!);
          continue;
        }
        if (name === 'checkpoint' && pending.length) {
          const first = pending[0];
          const { line, character } = source.getLineAndCharacterOfPosition(first.getStart(source));
          const checkpointLine = source.getLineAndCharacterOfPosition(call!.getStart(source)).line + 1;
          issues.push({
            line: line + 1,
            column: character + 1,
            message: `Merge ${pending.length} preceding addKeyFrame() call(s) into checkpoint() at line ${checkpointLine} using its { keyFrames: [...] } option. Include every concept from all calls so their images appear on the checkpoint.`,
          });
        }
        pending = [];
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  return issues;
}
