/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import ts from 'typescript';

export interface RawDataIssue { line: number; column: number; message: string }
const marker = 'e2e-allow-raw-data:';
const fileOperations = new Set(['readFile', 'readFileSync', 'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync']);

/** Audit the whole spec, including local helpers. Exceptions cover one statement or explicit block. */
export function auditRawData(text: string, filename = 'scenario.spec.ts'): RawDataIssue[] {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const bindings = new Map<string, string>([['JSON', 'JSON']]);
  const issues: RawDataIssue[] = [];
  const used = new Set<number>();
  const comments: Array<{ start: number; end: number; reason: string }> = [];
  const commentStarts = new Set<number>();
  function collectComments(node: ts.Node): void {
    for (const range of ts.getLeadingCommentRanges(text, node.pos) ?? []) {
      const value = text.slice(range.pos, range.end);
      if (!value.includes(marker) || commentStarts.has(range.pos)) continue;
      commentStarts.add(range.pos);
      comments.push({ start: range.pos, end: range.end, reason: value.slice(value.indexOf(marker) + marker.length).replace(/\*\/$/, '').trim() });
    }
    ts.forEachChild(node, collectComments);
  }
  collectComments(source);
  function report(node: ts.Node | number, message: string) {
    const { line, character } = source.getLineAndCharacterOfPosition(typeof node === 'number' ? node : node.getStart(source));
    issues.push({ line: line + 1, column: character + 1, message });
  }
  function target(node: ts.Expression): string | undefined {
    if (ts.isIdentifier(node)) return bindings.get(node.text);
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return target(node.expression);
    if (ts.isPropertyAccessExpression(node)) {
      const base = target(node.expression);
      return base && `${base}.${node.name.text}`;
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)) {
      const base = target(node.expression);
      return base && `${base}.${node.argumentExpression.text}`;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) return moduleKind(node.arguments[0].text);
    return undefined;
  }
  function moduleKind(name: string) {
    if (/^(node:)?fs(?:\/promises)?$/.test(name)) return 'fs';
    if (name === 'yaml' || name === 'js-yaml') return 'YAML';
    return undefined;
  }
  function bind(name: ts.BindingName, value: string | undefined) {
    if (!value) return;
    if (ts.isIdentifier(name)) bindings.set(name.text, value);
    else if (ts.isObjectBindingPattern(name)) for (const element of name.elements) {
      if (ts.isIdentifier(element.name)) bindings.set(element.name.text, `${value}.${element.propertyName?.getText(source) ?? element.name.text}`);
    }
  }
  function collect(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const kind = moduleKind(node.moduleSpecifier.text);
      const clause = node.importClause;
      if (kind && clause) {
        if (clause.name) bindings.set(clause.name.text, kind);
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) bindings.set(clause.namedBindings.name.text, kind);
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const element of clause.namedBindings.elements) bindings.set(element.name.text, `${kind}.${element.propertyName?.text ?? element.name.text}`);
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer) bind(node.name, target(node.initializer));
    ts.forEachChild(node, collect);
  }
  collect(source);
  function exception(node: ts.Node): boolean {
    for (let current: ts.Node | undefined = node; current && current !== source; current = current.parent) {
      if (!ts.isStatement(current) || ts.isFunctionDeclaration(current)) continue;
      // A function body is not a scoped exception: annotate its particular statements instead.
      if (ts.isBlock(current) && ts.isFunctionLike(current.parent)) continue;
      const start = current.getStart(source);
      const comment = comments.find(item => item.end <= start && /^\s*$/.test(text.slice(item.end, start)));
      if (comment) {
        used.add(comment.start);
        if (comment.reason.length < 15) { report(comment.start, 'Raw-data exceptions need a specific reason (at least 15 characters).'); return false; }
        return true;
      }
    }
    return false;
  }
  function walk(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const name = target(node.expression);
      if (name && ((name.startsWith('fs.') && fileOperations.has(name.split('.').at(-1)!)) || /^(JSON\.parse|YAML\.(parse|parseDocument|load|loadAll))$/.test(name))) {
        if (!exception(node)) report(node, `${name} belongs in a reusable utility or page object.`);
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  for (const comment of comments) if (!used.has(comment.start)) report(comment.start, 'Unused or misplaced raw-data exception; put it immediately before the statement or explicit block that needs raw access.');
  return issues;
}
