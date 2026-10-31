/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import ts from 'typescript';
import type { RecordedCheckpoint } from '../../e2e/src/artifacts/scenarioCheckpoints.js';

export interface CheckpointSourceBlock {
  line: number;
  endLine: number;
  indent: number;
  message: string;
  text?: RecordedCheckpoint['text'];
  checkpointId?: number;
}

/** Replace only standalone checkpoint statements; never hide surrounding code. */
export function checkpointSourceBlocks(source: string, captured: RecordedCheckpoint[] = []): CheckpointSourceBlock[] {
  const ast = ts.createSourceFile('scenario.ts', source, ts.ScriptTarget.Latest, true);
  const blocks: CheckpointSourceBlock[] = [];
  const used = new Set<number>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['checkpoint', 'snapshot'].includes(node.expression.text)) {
      let expression: ts.Node = node;
      if (ts.isAwaitExpression(expression.parent)) expression = expression.parent;
      if (ts.isArrowFunction(expression.parent) && expression.parent.body === expression
        && ts.isCallExpression(expression.parent.parent) && ts.isIdentifier(expression.parent.parent.expression)
        && expression.parent.parent.expression.text === 'sourceCommand') {
        expression = expression.parent.parent;
        if (ts.isAwaitExpression(expression.parent)) expression = expression.parent;
      }
      if (ts.isExpressionStatement(expression.parent)) {
        const statement = expression.parent;
        const start = ast.getLineAndCharacterOfPosition(statement.getStart(ast));
        const end = ast.getLineAndCharacterOfPosition(statement.end - 1);
        const lines = source.split('\n');
        const before = lines[start.line].slice(0, start.character);
        const after = lines[end.line].slice(end.character + 1);
        const argument = node.arguments[0];
        const literal = argument && ts.isStringLiteralLike(argument) ? argument.text : undefined;
        const record = captured.find(entry => !used.has(entry.id) && entry.sourceLine === start.line + 1)
          ?? captured.find(entry => !used.has(entry.id) && entry.message === literal);
        if (record) used.add(record.id);
        if (!before.trim() && !after.trim() && (record || literal !== undefined)) {
          blocks.push({ line: start.line + 1, endLine: end.line + 1, indent: start.character,
            message: record?.message ?? literal!, ...(record?.text ? { text: record.text } : {}),
            ...(record ? { checkpointId: record.id } : {}) });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return blocks;
}

export interface TestSourceLocations {
  testLine: number | null;
  testClosing?: { start: number; end: number };
  finalStateCheckSkip?: { start: number; end: number };
  setupLine?: number;
  checkpoints: { message: string; line: number }[];
  sections?: {
    declaration: { start: number; end: number };
    steps: { id: string; start: number; end: number; closingStart: number; closingEnd: number; returnedValues?: { start: number; end: number } }[];
  };
  scenarioProse?: { name: { start: number; end: number }; description?: { start: number; end: number } };
}

/** Resolve captured calls without depending on quote style or string escaping. */
export function testSourceLocations(source: string, captured: RecordedCheckpoint[] = []): TestSourceLocations {
  const ast = ts.createSourceFile('scenario.ts', source, ts.ScriptTarget.Latest, true);
  const locations: TestSourceLocations = { testLine: null, checkpoints: [] };
  const setup = ast.statements.find(statement => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && ts.isPropertyAccessExpression(statement.expression.expression)
    && ts.isIdentifier(statement.expression.expression.expression)
    && statement.expression.expression.expression.text === 'test'
    && statement.expression.expression.name.text === 'use');
  if (setup) locations.setupLine = ast.getLineAndCharacterOfPosition(setup.getStart(ast)).line + 1;
  const range = (start: number, end: number) => ({
    start: ast.getLineAndCharacterOfPosition(start).line + 1,
    end: ast.getLineAndCharacterOfPosition(end - 1).line + 1,
  });
  const proseDeclaration = (variable: string, helper: string) => ast.statements.find(statement => {
    if (!ts.isVariableStatement(statement)) return false;
    const declaration = statement.declarationList.declarations.find(candidate =>
      ts.isIdentifier(candidate.name) && candidate.name.text === variable);
    return declaration?.initializer && ts.isCallExpression(declaration.initializer)
      && ts.isIdentifier(declaration.initializer.expression)
      && declaration.initializer.expression.text === helper;
  });
  const sectionsDeclaration = proseDeclaration('sections', 'scenarioSections');
  if (sectionsDeclaration) locations.sections = { declaration: range(sectionsDeclaration.getStart(ast), sectionsDeclaration.end), steps: [] };
  const visit = (node: ts.Node) => {
    if (locations.sections && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'test' && node.expression.name.text === 'step') {
      const [title, callback] = node.arguments;
      if (title && ts.isPropertyAccessExpression(title) && ts.isPropertyAccessExpression(title.expression)
        && ts.isIdentifier(title.expression.expression) && title.expression.expression.text === 'sections'
        && title.expression.name.text === 'steps' && callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body)) {
        const expression = ts.isAwaitExpression(node.parent) ? node.parent : node;
        let statement: ts.Statement | undefined;
        let returnedValues: { start: number; end: number } | undefined;
        if (ts.isExpressionStatement(expression.parent)) statement = expression.parent;
        else if (ts.isVariableDeclaration(expression.parent) && expression.parent.initializer === expression
          && ts.isObjectBindingPattern(expression.parent.name)) {
          const declaration = expression.parent;
          const list = declaration.parent;
          const returned = callback.body.statements.at(-1);
          const bindings = expression.parent.name.elements;
          // A step may return shared values for the next section. Hide only
          // this exact transfer pattern, preserving all other assignment code.
          if (ts.isVariableDeclarationList(list) && list.declarations.length === 1 && ts.isVariableStatement(list.parent)
            && bindings.every(binding => !binding.dotDotDotToken && !binding.propertyName && !binding.initializer && ts.isIdentifier(binding.name))
            && returned && ts.isReturnStatement(returned) && returned.expression && ts.isObjectLiteralExpression(returned.expression)
            && returned.expression.properties.length === bindings.length
            && returned.expression.properties.every(property => ts.isShorthandPropertyAssignment(property)
              && bindings.some(binding => binding.name.getText(ast) === property.name.text))) {
            statement = list.parent;
            returnedValues = range(returned.getStart(ast), returned.end);
          }
        }
        if (statement) {
          const header = range(statement.getStart(ast), callback.body.getStart(ast) + 1);
          const footer = range(callback.body.end - 1, statement.end);
          // Keep compact steps intact so hiding a wrapper never hides executable code.
          if (callback.body.statements.every(child => range(child.getStart(ast), child.end).start > header.end
            && range(child.getStart(ast), child.end).end < footer.start)) {
            locations.sections.steps.push({ id: title.name.text, ...header, closingStart: footer.start, closingEnd: footer.end,
              ...(returnedValues ? { returnedValues } : {}) });
          }
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      if (node.expression.text === 'test' && locations.testLine === null) {
        locations.testLine = line;
        const callback = node.arguments.at(-1);
        if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && ts.isBlock(callback.body)) {
          const statement = callback.body.statements.at(-1);
          if (statement && ts.isExpressionStatement(statement)) {
            let expression = statement.expression;
            if (ts.isAwaitExpression(expression)) expression = expression.expression;
            if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === 'sourceCommand'
              && expression.arguments.length === 1 && ts.isArrowFunction(expression.arguments[0])
              && expression.arguments[0].parameters.length === 0 && !ts.isBlock(expression.arguments[0].body)) {
              expression = expression.arguments[0].body;
              if (ts.isAwaitExpression(expression)) expression = expression.expression;
            }
            if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)
              && expression.expression.text === 'skipMeadowHomeStateCheck' && expression.arguments.length === 0) {
              const start = ast.getLineAndCharacterOfPosition(statement.getStart(ast));
              const end = ast.getLineAndCharacterOfPosition(statement.end);
              const lines = source.split('\n');
              if (!lines[start.line].slice(0, start.character).trim() && !lines[end.line].slice(end.character).trim()) {
                locations.finalStateCheckSkip = range(statement.getStart(ast), statement.end);
              }
            }
          }
        }
        if (locations.sections && callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
          && ts.isBlock(callback.body) && ts.isExpressionStatement(node.parent)) {
          const closing = range(callback.body.end - 1, node.parent.end);
          const lines = source.split('\n');
          const start = ast.getLineAndCharacterOfPosition(callback.body.end - 1);
          const end = ast.getLineAndCharacterOfPosition(node.parent.end);
          // Never hide an assertion or trailing statement sharing the closing line.
          if (!lines[start.line].slice(0, start.character).trim() && !lines[end.line].slice(end.character).trim()
            && callback.body.statements.every(statement => range(statement.getStart(ast), statement.end).end < closing.start)) {
            locations.testClosing = closing;
          }
        }
        const title = node.arguments[0];
        if (title && ts.isPropertyAccessExpression(title) && ts.isIdentifier(title.expression)) {
          const statement = proseDeclaration(title.expression.text, 'linkedScenarioName');
          if (statement) {
            let descriptionDeclaration: ts.Statement | undefined;
            const findDescription = (option: ts.Node) => {
              if (ts.isPropertyAccessExpression(option) && option.name.text === 'annotation' && ts.isIdentifier(option.expression)) {
                descriptionDeclaration ??= proseDeclaration(option.expression.text, 'linkedScenarioDescription');
              }
              ts.forEachChild(option, findDescription);
            };
            if (node.arguments[1]) findDescription(node.arguments[1]);
            const comment = ts.getLeadingCommentRanges(source, node.parent.getFullStart())?.at(-1);
            locations.scenarioProse = {
              name: range(statement.getStart(ast), statement.end),
              ...(descriptionDeclaration ? { description: range(descriptionDeclaration.getStart(ast), descriptionDeclaration.end) }
                : comment?.kind === ts.SyntaxKind.MultiLineCommentTrivia ? { description: range(comment.pos, comment.end) } : {}),
            };
          }
        }
      }
      const message = node.arguments[0];
      // Runs recorded before the checkpoint rename called snapshot().
      if (['checkpoint', 'snapshot'].includes(node.expression.text) && message) {
        const record = captured.find(entry => entry.sourceLine === line);
        if (record || ts.isStringLiteralLike(message)) locations.checkpoints.push({ message: record?.message ?? (message as ts.StringLiteralLike).text, line: record?.sourceLine ?? line });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return locations;
}
