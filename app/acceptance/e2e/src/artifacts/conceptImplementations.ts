/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { conceptExports } from './conceptRegistryMetadata.js';
import type { AnyMeadowConcept, conceptImplementationNavigation, conceptRoleValidation, ParticipatesIn } from '../../../../concepts/index.js';

export interface ConceptImplementation {
  conceptId: string;
  role: string;
  symbol: string;
  /** Relative to app/, pointing at the implementation rather than its declaration of participation. */
  file: string;
  line: number;
  column: number;
}
export interface ImplementationSource { file: string; text: string }

/** The checker and reverse navigation share one AST extraction of exact identities. */
export function extractConceptImplementations(sources: ImplementationSource[], appRoot: string,
  exports: Record<string, unknown> = conceptExports): { entries: ConceptImplementation[]; errors: string[] } {
  const entries: ConceptImplementation[] = [];
  const errors: string[] = [];
  for (const source of sources) {
    const ast = ts.createSourceFile(source.file, source.text, ts.ScriptTarget.Latest, true);
    const hasDeclaration = ast.statements.some(statement => ts.isTypeAliasDeclaration(statement) && statement.name.text.endsWith('MeadowConceptParticipations'));
    const relative = path.relative(appRoot, source.file).split(path.sep).join('/');
    const imports = new Map<string, string>();
    const participationNames = new Set(['ParticipatesIn']);
    const fail = (message: string) => errors.push(`${relative}: ${message}`);
    for (const statement of ast.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.includes('concepts/')) continue;
      const resolved = path.resolve(path.dirname(source.file), specifier).replace(/\.(?:js|ts)$/, '');
      const registry = path.join(appRoot, 'concepts/index');
      const bindings = statement.importClause?.namedBindings;
      const named = bindings && ts.isNamedImports(bindings) ? bindings.elements : [];
      for (const item of named) if ((item.propertyName ?? item.name).text === 'ParticipatesIn') participationNames.add(item.name.text);
      if (!hasDeclaration) continue;
      if (resolved !== registry) fail('participation imports must use the public concepts/index entry point');
      if (!statement.importClause?.isTypeOnly && named.some(item => !item.isTypeOnly)) fail('production concept imports must be type-only');
      if (!statement.importClause?.isTypeOnly && !named.length) fail('production concept imports must be type-only named imports');
      if (resolved === registry) for (const item of named) imports.set(item.name.text, (item.propertyName ?? item.name).text);
    }
    const declarations = new Map<string, ts.Node>();
    for (const statement of ast.statements) {
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && statement.name) declarations.set(statement.name.text, statement);
      if (ts.isVariableStatement(statement)) for (const item of statement.declarationList.declarations) if (ts.isIdentifier(item.name)) declarations.set(item.name.text, item);
    }
    const visit = (node: ts.Node, inline = false) => {
      if (ts.isTypeAliasDeclaration(node)) inline = node.name.text.endsWith('MeadowConceptParticipations');
      if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && participationNames.has(node.typeName.text)) {
        if (!inline) fail('ParticipatesIn must be inside an inline MeadowConceptParticipations declaration');
        if (imports.get(node.typeName.text) !== 'ParticipatesIn') fail('ParticipatesIn must be imported from the public concept registry');
        const [concept, role, participant] = node.typeArguments ?? [];
        const local = concept && ts.isTypeQueryNode(concept) && ts.isIdentifier(concept.exprName) ? concept.exprName.text : undefined;
        const exported = local && imports.get(local);
        const value = exported ? exports[exported] as AnyMeadowConcept | undefined : undefined;
        if (!value?.id || !Array.isArray(value.implementationRoles)) { fail(`unknown concept identity ${local ?? concept?.getText(ast) ?? '(missing)'}`); return; }
        if (!role || !ts.isLiteralTypeNode(role) || !ts.isStringLiteral(role.literal)) { fail('participation role must be an exact string literal'); return; }
        if (!value.implementationRoles.includes(role.literal.text)) fail(`concept "${value.id}" does not declare role "${role.literal.text}"`);
        const symbol = participant?.getText(ast).replace(/^typeof\s+/, '');
        const parts = symbol?.replace(/\[['"]([^'"]+)['"]\]/g, '.$1').split('.').filter(part => part !== 'prototype');
        let declaration = parts?.length ? declarations.get(parts[0]) : undefined;
        for (const part of parts?.slice(1) ?? []) {
          declaration = declaration && (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration))
            ? declaration.members.find(member => member.name?.getText(ast).replace(/^['"]|['"]$/g, '') === part) : undefined;
        }
        if (!declaration || !symbol) { fail(`participant "${symbol ?? '(missing)'}" must name an implementation in this file`); return; }
        const location = ast.getLineAndCharacterOfPosition(declaration.getStart(ast));
        entries.push({ conceptId: value.id, role: role.literal.text, symbol, file: relative, line: location.line + 1, column: location.character + 1 });
      }
      ts.forEachChild(node, child => visit(child, inline));
    };
    visit(ast);
  }
  return { entries, errors };
}

export function validateConceptImplementationRoles(concepts: readonly AnyMeadowConcept[], entries: readonly ConceptImplementation[]): string[] {
  const pairs = new Set(entries.map(entry => JSON.stringify([entry.conceptId, entry.role])));
  return concepts.flatMap(concept => (concept.implementationRoles ?? []).filter(role => !pairs.has(JSON.stringify([concept.id, role])))
    .map(role => `concept "${concept.id}" has no inline participant for role "${role}"`));
}

/** Do not follow extension mounts or generated trees into another source authority. */
export function readConceptImplementations(appRoot: string) {
  const sources: ImplementationSource[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git', 'concepts', 'meadow-extension', 'test', 'tests', 'test-results', 'fixtures', '_module'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /\.(ts|tsx)$/.test(file) && !/\.(test|spec)\./.test(file)) {
        const text = fs.readFileSync(file, 'utf8');
        if (text.includes('MeadowConceptParticipations') || text.includes('ParticipatesIn<')) sources.push({ file, text });
      }
    }
  };
  walk(appRoot);
  return extractConceptImplementations(sources, appRoot);
}

export type ConceptExtractionMeadowConceptParticipations = [
  ParticipatesIn<typeof conceptImplementationNavigation, 'extract-identities', typeof extractConceptImplementations>,
  ParticipatesIn<typeof conceptRoleValidation, 'validate-pairs', typeof validateConceptImplementationRoles>,
];
