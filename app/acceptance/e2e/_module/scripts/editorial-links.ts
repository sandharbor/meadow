/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import ts from 'typescript';
import { scenarioMetadataIssues } from './scenario-metadata.js';

export interface EditorialConceptIndex {
  exportNameToId: ReadonlyMap<string, string>;
  conceptIds: ReadonlySet<string>;
}

export interface EditorialLinkIssue {
  line: number;
  message: string;
}

/** Selected-spec audit. Presence is mechanical; relevance and evidence need review. */
export function editorialLinkIssues(source: ts.SourceFile, registry: EditorialConceptIndex): EditorialLinkIssue[] {
  const issues: EditorialLinkIssue[] = [];
  const report = (node: ts.Node, message: string) => issues.push({
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, message,
  });
  const imports = new Map<string, string>();
  const declarations = new Map<string, ts.VariableDeclaration>();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
      && /\/concepts\/(?:meadow-extension\/)?index\.js$/.test(statement.moduleSpecifier.text)
      && !statement.importClause?.isTypeOnly) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements) {
        if (!entry.isTypeOnly) imports.set(entry.name.text, entry.propertyName?.text ?? entry.name.text);
      }
    }
    if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration);
      }
    }
  }
  const importedCall = (node: ts.Node | undefined, helper: string): node is ts.CallExpression =>
    !!node && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && imports.get(node.expression.text) === helper;
  const linkedConcept = (node: ts.Expression): boolean => {
    if (!importedCall(node, 'conceptLink') && !importedCall(node, 'documentLink')) return false;
    const [target, label] = node.arguments;
    if (!target || !label || !ts.isStringLiteralLike(label) || !label.text.trim()) return false;
    let id: string | undefined;
    if (ts.isStringLiteralLike(target)) id = target.text;
    else if (ts.isPropertyAccessExpression(target) && target.name.text === 'id' && ts.isIdentifier(target.expression)) {
      const name = imports.get(target.expression.text);
      if (name) id = registry.exportNameToId.get(name);
    }
    return id !== undefined && registry.conceptIds.has(id);
  };
  const hasLink = (node: ts.Expression | undefined): boolean => {
    if (!node || !ts.isTaggedTemplateExpression(node) || !ts.isIdentifier(node.tag)
      || imports.get(node.tag.text) !== 'conceptText' || !ts.isTemplateExpression(node.template)) return false;
    // Only direct interpolations establish that the captured prose contains a link.
    // Links in comments, keyframes, callbacks, or conditional dead branches do not.
    return node.template.templateSpans.some(span => linkedConcept(span.expression) || hasLink(span.expression));
  };
  const description = declarations.get('description');
  const descriptionCall = description?.initializer;
  if (!importedCall(descriptionCall, 'linkedScenarioDescription') || !hasLink(descriptionCall.arguments[0])) {
    report(description ?? source, 'description requires a canonical conceptLink in its typed conceptText prose.');
  }
  const sections = declarations.get('sections');
  const sectionsCall = sections?.initializer;
  const entries = importedCall(sectionsCall, 'scenarioSections') ? sectionsCall.arguments[0] : undefined;
  if (!entries || !ts.isObjectLiteralExpression(entries) || entries.properties.length === 0) {
    report(sections ?? source, 'Declare sections with a non-empty literal scenarioSections object so every section can be audited.');
    return issues;
  }
  for (const entry of entries.properties) {
    if (!ts.isPropertyAssignment(entry) || !ts.isObjectLiteralExpression(entry.initializer)) {
      report(entry, 'Use an explicit section declaration; this audit cannot verify spread or computed section prose.');
      continue;
    }
    const prose = entry.initializer.properties.find((property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === 'text');
    if (!hasLink(prose?.initializer)) {
      report(prose ?? entry, `section ${entry.name.getText(source)} requires a canonical conceptLink in its typed conceptText prose (including setup).`);
    }
  }
  return issues;
}

/** The selected-spec CLI also enforces captured scenario metadata. */
export function auditEditorialSource(text: string, registry: EditorialConceptIndex, filename = 'scenario.spec.ts') {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  return [...scenarioMetadataIssues(source), ...editorialLinkIssues(source, registry)];
}
