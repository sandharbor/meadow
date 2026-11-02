/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import ts from 'typescript';

export const FINAL_CALL_NAMES = ['assertMeadowHomeState', 'skipMeadowHomeStateCheck'] as const;
const required = FINAL_CALL_NAMES.map(name => `${name}()`).join(' or ');
export interface FinalAssertionIssue { line: number; column: number; message: string }
export interface FinalAssertionAudit { scenarioCount: number; analyzedBodies: number; issues: FinalAssertionIssue[] }

function testModifier(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee) && callee.text === 'test') return 'test';
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'test'
    && ['only', 'skip', 'fixme'].includes(callee.name.text)) return callee.name.text;
  return undefined;
}

/** Both Playwright signatures share the final callback; unsupported bodies must fail visibly. */
export function auditFinalAssertions(text: string, filename = 'scenario.spec.ts'): FinalAssertionAudit {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const result: FinalAssertionAudit = { scenarioCount: 0, analyzedBodies: 0, issues: [] };
  const report = (node: ts.Node, message: string) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    result.issues.push({ line: line + 1, column: character + 1, message });
  };
  const isCallback = (node: ts.Node | undefined): node is ts.ArrowFunction | ts.FunctionExpression =>
    !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

  function check(call: ts.CallExpression, modifier: string): void {
    const last = call.arguments.at(-1);
    // These are conditional annotations, not authored scenario declarations:
    // test.skip(condition, 'reason'), test.fixme(), and their one-argument forms.
    if (['skip', 'fixme'].includes(modifier) && !isCallback(last) && call.arguments.length < 3) {
      const first = call.arguments[0];
      if (!first || (call.arguments.length === 2 && last && ts.isStringLiteralLike(last))
        || (!ts.isStringLiteralLike(first) && !(ts.isPropertyAccessExpression(first) && first.name.text === 'name'))) return;
    }
    result.scenarioCount++;
    if (![2, 3].includes(call.arguments.length) || !isCallback(last) || !ts.isBlock(last.body)) {
      report(call, 'Cannot inspect this scenario body. Use test(title, async (...) => { ... }) or test(title, metadata, async (...) => { ... }) with an inline block callback so final-assertion placement can be checked.');
      return;
    }
    result.analyzedBodies++;
    const checkpoints: ts.CallExpression[] = [];
    const finals: ts.CallExpression[] = [];
    function findCalls(node: ts.Node): void {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === 'checkpoint') checkpoints.push(node);
        if (FINAL_CALL_NAMES.some(name => name === node.expression.getText(source))) finals.push(node);
      }
      ts.forEachChild(node, findCalls);
    }
    findCalls(last.body);
    if (!finals.length) {
      report(call, `Scenario must call ${required} at least once, after its last checkpoint().`);
      return;
    }
    const lastCheckpoint = checkpoints.at(-1);
    if (lastCheckpoint && finals.at(-1)!.getStart(source) < lastCheckpoint.end) {
      const checkpointLine = source.getLineAndCharacterOfPosition(lastCheckpoint.getStart(source)).line + 1;
      report(lastCheckpoint, `Move ${required} after the last checkpoint() at line ${checkpointLine}.`);
    }
  }
  function walk(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const modifier = testModifier(node);
      if (modifier) check(node, modifier);
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  if (!result.scenarioCount) report(source, 'No scenario declaration was checked. Expected test(title, callback) or test(title, metadata, callback).');
  return result;
}
