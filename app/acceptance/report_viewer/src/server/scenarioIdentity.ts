/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import ts from 'typescript';
import { existsSync, readFileSync, statSync } from 'node:fs';
const cache = new Map<string, { mtime: number; ids: Map<string, string> }>();
/** Bridge older recordings to the explicit identity now carried by their spec. */
export function scenarioIdFromSpec(filename: string | undefined, title: string): string | undefined {
  if (!filename || !existsSync(filename)) return undefined;
  const mtime = statSync(filename).mtimeMs;
  let cached = cache.get(filename);
  if (!cached || cached.mtime !== mtime) {
    const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const ids = new Map<string, string>();
    const property = (node: ts.ObjectLiteralExpression, name: string) => node.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(source) === name) as ts.PropertyAssignment | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'test') {
        const [name, details] = node.arguments;
        if (name && ts.isStringLiteralLike(name) && details && ts.isObjectLiteralExpression(details)) {
          const annotations = property(details, 'annotation')?.initializer;
          const items = annotations && ts.isArrayLiteralExpression(annotations) ? annotations.elements : annotations ? [annotations] : [];
          for (const item of items) if (ts.isObjectLiteralExpression(item)) {
            const type = property(item, 'type')?.initializer;
            const id = property(item, 'description')?.initializer;
            if (type && ts.isStringLiteralLike(type) && type.text === 'scenario-id' && id && ts.isStringLiteralLike(id)) {
              ids.set(name.text, id.text);
              ids.set(name.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), id.text);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source); cached = { mtime, ids }; cache.set(filename, cached);
  }
  return cached.ids.get(title);
}
