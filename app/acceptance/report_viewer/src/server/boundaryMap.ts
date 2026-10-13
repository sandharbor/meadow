/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import type { areaBoundaryMap, ParticipatesIn, MeadowDocument } from '../../../../concepts/index.js';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { appAreaSurfaces, ownership, publicName, AREA_CALLERS, canonical, inside } from '../../../../shared_code/check_support/area_boundary_policy.js';

export interface BoundaryEntry {
  id: string; name: string; category: 'api' | 'type' | 'data' | 'shared';
  areaIds: string[]; participants: string[]; file: string; line: number;
  implementationFile?: string; implementationSymbol?: string;
  declaration: string; explanation: string; consumers: { file: string; line: number; area: string }[];
}
export interface BoundaryMap { entries: BoundaryEntry[]; scannedFiles: number; provenance: 'current-code' }
const lifecycle = ['bundle/sourcing', 'bundle/curation', 'bundle/generation', 'bundle/review', 'bundle/sharing'];
const excluded = new Set(['node_modules', 'dist', 'build', 'target', '.git', '_module', 'test', 'tests', '__tests__']);
function sources(root: string, seen = new Set<string>()): string[] {
  if (!fs.existsSync(root) || seen.has(canonical(root))) return [];
  seen.add(canonical(root));
  return fs.readdirSync(root).flatMap(name => {
    if (excluded.has(name)) return [];
    const file = path.join(root, name);
    return fs.statSync(file).isDirectory() ? sources(file, seen)
      : /\.[cm]?tsx?$/.test(name) && !/\.(test|spec|d)\.ts$/.test(name) ? [canonical(file)] : [];
  });
}
const areasFor = (area: string) => area === 'bundle/shared-sourcing-curation' ? lifecycle.slice(0, 2) : lifecycle.includes(area) ? [area] : [];

/** Derive symbol use, including aliases and transitive shared type dependencies, from the current checkout. */
export function readBoundaryMap(appRoot: string): BoundaryMap {
  appRoot = canonical(appRoot);
  const surfaces = appAreaSurfaces(appRoot);
  const roots = [...surfaces.implementationFamilies.flat(), ...surfaces.contractRoots, path.join(appRoot, 'shared_code')].map(canonical);
  const files = [...new Set(roots.flatMap(root => sources(root)))];
  const program = ts.createProgram(files, { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, jsx: ts.JsxEmit.ReactJSX, skipLibCheck: true, noLib: true, allowJs: true });
  const checker = program.getTypeChecker();
  const symbolOf = (node: ts.Node) => {
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol;
  };
  const parsed = files.map(file => program.getSourceFile(file)).filter((source): source is ts.SourceFile => !!source);
  const entries: BoundaryEntry[] = [];
  const apis = new Map<ts.Symbol, BoundaryEntry[]>();
  const shared = new Map<ts.Symbol, BoundaryEntry>();
  const dependencies = new Map<ts.Symbol, Set<ts.Symbol>>();
  const makeEntry = (source: ts.SourceFile, node: ts.Node, name: string, category: BoundaryEntry['category']): BoundaryEntry => {
    const file = path.relative(appRoot, source.fileName);
    const nameNode = 'name' in node ? node.name as ts.Node | undefined : undefined;
    const symbol = symbolOf(nameNode ?? node);
    const explanation = symbol ? ts.displayPartsToString(symbol.getDocumentationComment(checker)) : '';
    return { id: `code-boundary/${file}/${name}`, name, category, file,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      declaration: node.getText(source), explanation, areaIds: [], participants: [], consumers: [] };
  };
  for (const source of parsed) {
    const owner = ownership(source.fileName, roots);
    if (source.fileName === owner.interface) {
      for (const node of source.statements) {
        if (!ts.isExportDeclaration(node) || !node.exportClause || !ts.isNamedExports(node.exportClause)) continue;
        for (const element of node.exportClause.elements) {
          const entry = makeEntry(source, node, element.name.text, 'api');
          const caller = publicName(element.name.text, node.isTypeOnly || element.isTypeOnly, surfaces.implementationFamilies[1]?.some(root => inside(canonical(root), source.fileName)) ?? false);
          const callerArea = [...AREA_CALLERS].find(([, value]) => value === caller)?.[0];
          entry.participants = [...new Set([owner.area!, callerArea ?? caller ?? 'unassigned'])];
          entry.areaIds = [...new Set(entry.participants.flatMap(areasFor))];
          const symbol = symbolOf(element.name);
          if (symbol) {
            entry.explanation = ts.displayPartsToString(symbol.getDocumentationComment(checker));
            const declaration = symbol.declarations?.[0];
            if (declaration) {
              entry.implementationFile = path.relative(appRoot, declaration.getSourceFile().fileName);
              entry.implementationSymbol = (declaration as ts.NamedDeclaration).name?.getText(declaration.getSourceFile()) ?? symbol.name;
            }
            apis.set(symbol, [...(apis.get(symbol) ?? []), entry]);
          }
          entries.push(entry);
        }
      }
    }
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (owner.area || !source.fileName.includes('/shared') || !moduleSymbol) continue;
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const declaration = symbol.declarations?.find(node => node.getSourceFile() === source);
      if (!declaration || shared.has(symbol) || symbol.name.endsWith('MeadowConceptParticipations')) continue;
      const callable = checker.getTypeOfSymbolAtLocation(symbol, declaration).getCallSignatures().length > 0;
      const category = ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration) ? 'type'
        : callable ? 'shared' : ts.isVariableDeclaration(declaration) || ts.isEnumDeclaration(declaration) ? 'data' : 'shared';
      const declaredName = (declaration as ts.NamedDeclaration).name?.getText(source);
      const entry = makeEntry(source, declaration, exported.name === 'default' ? declaredName ?? exported.name : exported.name, category);
      entry.implementationFile = entry.file; entry.implementationSymbol = (declaration as ts.NamedDeclaration).name?.getText(declaration.getSourceFile()) ?? symbol.name;
      shared.set(symbol, entry);
      const refs = new Set<ts.Symbol>();
      const visit = (node: ts.Node) => { if (ts.isIdentifier(node)) { const ref = symbolOf(node); if (ref && ref !== symbol) refs.add(ref); } ts.forEachChild(node, visit); };
      visit(declaration);
      dependencies.set(symbol, refs);
    }
  }
  // Private shared intermediates can carry exported contracts without becoming map entries.
  const parsedFiles = new Set(files);
  const dependenciesFor = (symbol: ts.Symbol): Set<ts.Symbol> => {
    const known = dependencies.get(symbol);
    if (known) return known;
    const refs = new Set<ts.Symbol>();
    dependencies.set(symbol, refs);
    for (const declaration of symbol.declarations ?? []) {
      const file = declaration.getSourceFile().fileName;
      if (!parsedFiles.has(file) || !file.includes('/shared') || ownership(file, roots).area || ts.isSourceFile(declaration)) continue;
      const visit = (node: ts.Node) => { if (ts.isIdentifier(node)) { const ref = symbolOf(node); if (ref && ref !== symbol) refs.add(ref); } ts.forEachChild(node, visit); };
      visit(declaration);
    }
    return refs;
  };
  // Imports alone are not usage. Resolve identifier references, ignoring import/export declarations.
  for (const source of parsed) {
    const owner = ownership(source.fileName, roots);
    const participant = owner.area ?? (owner.caller === 'appShell' ? 'appShell' : undefined);
    if (!participant) continue;
    const mark = (symbol: ts.Symbol, node: ts.Node, visited = new Set<ts.Symbol>()) => {
      if (visited.has(symbol)) return;
      visited.add(symbol);
      const entry = shared.get(symbol);
      if (entry) {
        if (!entry.participants.includes(participant)) entry.participants.push(participant);
        for (const area of areasFor(participant)) if (!entry.areaIds.includes(area)) entry.areaIds.push(area);
        const file = path.relative(appRoot, source.fileName), line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        if (!entry.consumers.some(use => use.file === file && use.line === line)) entry.consumers.push({ file, line, area: participant });
      }
      for (const dependency of dependenciesFor(symbol)) mark(dependency, node, visited);
    };
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      if (ts.isIdentifier(node)) {
        const symbol = symbolOf(node);
        const declarationName = symbol?.declarations?.some(declaration => (declaration as ts.NamedDeclaration).name === node);
        if (symbol && !declarationName) mark(symbol, node);
        for (const entry of symbol && !declarationName ? apis.get(symbol) ?? [] : []) {
          if (entry.file !== path.relative(appRoot, source.fileName) && entry.participants.includes(participant) && participant !== entry.participants[0]) {
            const use = { file: path.relative(appRoot, source.fileName), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, area: participant };
            if (!entry.consumers.some(value => value.file === use.file && value.line === use.line)) entry.consumers.push(use);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  entries.push(...[...shared.values()].filter(entry => entry.areaIds.length > 1));
  for (const entry of entries) entry.areaIds.sort((a, b) => lifecycle.indexOf(a) - lifecycle.indexOf(b));
  return { provenance: 'current-code', scannedFiles: files.length,
    entries: entries.filter(entry => entry.areaIds.length > 0).sort((a, b) => a.category.localeCompare(b.category) || a.file.localeCompare(b.file) || a.name.localeCompare(b.name)) };
}

export function boundaryDocument(entry: BoundaryEntry, explanations: { id: string; name: string }[] = []): MeadowDocument {
  const text = (value: string) => ({ segments: [{ kind: 'text' as const, text: value }] });
  return { id: entry.id, name: entry.name, documentKind: 'code-boundary', appAreaIds: entry.areaIds,
    description: text(entry.explanation || (entry.category === 'api' ? `Public export from ${entry.file}.` : `${entry.category === 'type' ? 'Shared type' : entry.category === 'data' ? 'Shared value or data declaration' : 'Shared capability'} used across application areas.`)),
    sections: [
      ...(explanations.length ? [{ id: 'explanations', heading: 'Higher-level explanations', blocks: [{ kind: 'list' as const, items: explanations.map(doc => ({ segments: [{ kind: 'concept-link' as const, conceptId: doc.id, label: doc.name }] })) }] }] : []),
      { id: 'boundary', heading: 'Boundary', blocks: [{ kind: 'paragraph', text: text(`Participants: ${entry.participants.join(', ')}. ${entry.category === 'api' ? 'The export name identifies its permitted caller; listed uses show current consumers.' : 'Areas are derived from resolved symbol references, including dependencies of shared declarations.'}`) }] },
      { id: 'location', heading: 'Source location', blocks: [{ kind: 'paragraph', text: text(`${entry.file}:${entry.line}`) }] },
    ] };
}

export type BoundaryMapMeadowConceptParticipations = [
  ParticipatesIn<typeof areaBoundaryMap, 'read-boundaries', typeof readBoundaryMap>,
  ParticipatesIn<typeof areaBoundaryMap, 'describe-code', typeof boundaryDocument>,
];
