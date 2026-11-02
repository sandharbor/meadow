/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import ts from 'typescript';

export interface DirectLocatorIssue {
  line: number;
  column: number;
}

export function auditDirectLocators(text: string, filePath = "scenario.spec.ts"): DirectLocatorIssue[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.ESNext,
    true,
  );
  const issues: DirectLocatorIssue[] = [];

  function walk(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "locator"
    ) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.expression.name.getStart(sourceFile),
      );
      issues.push({
        line: line + 1,
        column: character + 1,
      });
    }
    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
  return issues;
}
