/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import ts from 'typescript';

export interface TestSourceLocations {
  testLine: number | null;
  setupLine?: number;
  checkpoints: { message: string; line: number }[];
  sections?: {
    declaration: { start: number; end: number };
    steps: { id: string; start: number; end: number; closingStart: number; closingEnd: number }[];
  };
  scenarioProse?: { name: { start: number; end: number }; description?: { start: number; end: number } };
}

/** Resolve captured calls without depending on quote style or string escaping. */
export function testSourceLocations(source: string): TestSourceLocations {
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
        const statement = ts.isAwaitExpression(node.parent) ? node.parent.parent : node.parent;
        const header = range(statement.getStart(ast), callback.body.getStart(ast) + 1);
        const footer = range(callback.body.end - 1, statement.end);
        // Keep compact steps intact so hiding a wrapper never hides executable code.
        if (ts.isExpressionStatement(statement) && callback.body.statements.every(child => range(child.getStart(ast), child.end).start > header.end
          && range(child.getStart(ast), child.end).end < footer.start)) {
          locations.sections.steps.push({ id: title.name.text, ...header, closingStart: footer.start, closingEnd: footer.end });
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      if (node.expression.text === 'test' && locations.testLine === null) {
        locations.testLine = line;
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
      if (['checkpoint', 'snapshot'].includes(node.expression.text) && message && ts.isStringLiteralLike(message)) {
        locations.checkpoints.push({ message: message.text, line });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return locations;
}
