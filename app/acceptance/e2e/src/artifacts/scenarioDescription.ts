/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import ts from "typescript";

/** Read only the block comment immediately above this scenario's declaration. */
export function extractScenarioDescription(source: string, line: number, column: number): string {
  const file = ts.createSourceFile("scenario.ts", source, ts.ScriptTarget.Latest, true);
  const position = file.getPositionOfLineAndCharacter(line - 1, column - 1);
  let description = "";
  const visit = (node: ts.Node): void => {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const start = node.getStart(file);
      // Playwright may locate the call at its name or its opening parenthesis.
      if (position >= start && position <= node.expression.expression.end) {
        const comment = ts.getLeadingCommentRanges(source, node.getFullStart())?.at(-1);
        if (comment?.kind === ts.SyntaxKind.MultiLineCommentTrivia && !source.slice(comment.end, start).trim()) {
          description = source.slice(comment.pos + 2, comment.end - 2)
            .split(/\r?\n/)
            .map(text => text.replace(/^\s*\* ?/, "").trimEnd())
            .join("\n")
            .trim();
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return description;
}
