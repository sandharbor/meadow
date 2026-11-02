/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import ts from 'typescript';
import { isScenarioTestCall, scenarioMetadataIssues } from './scenario-metadata.js';
import { declaredScenarioAreas } from '../../src/artifacts/declaredScenarioAreas.js';
import { resolveScenarioDocuments } from '../../src/artifacts/scenarioDocuments.js';
import type { DocumentRegistry } from '../../../../concepts/loadRegistry.js';
import * as concepts from '../../../../concepts/index.js';

export interface TestCase {
  title: string;
  line: number;
}

function isStringArg(node: ts.Node | undefined): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return !!node && ts.isStringLiteralLike(node);
}

function findTestCases(sourceFile: ts.SourceFile): TestCase[] {
  const tests: TestCase[] = [];

  function walk(node: ts.Node): void {
    if (isScenarioTestCall(node)) {
      const titleArg = node.arguments[0];
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      tests.push({
        title: isStringArg(titleArg) ? titleArg.text : "(unknown)",
        line: line + 1,
      });
    }
    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
  return tests;
}

/** Declared areas must be report areas, and each sub-area must belong to one of them. */
function scenarioAreaIssues(source: ts.SourceFile): string[] {
  const declared = declaredScenarioAreas(source);
  if (!declared) return [];
  const exported = concepts as unknown as Record<string, concepts.AnyMeadowConcept | undefined>;
  const areaIds = new Set<string>(concepts.acceptanceAppAreaConcepts.map(area => area.id));
  const issues: string[] = [];
  const declaredAreaIds = declared.appAreas.map(name => exported[name]?.id ?? name);
  for (const [index, name] of declared.appAreas.entries()) {
    if (!areaIds.has(declaredAreaIds[index])) issues.push(`${name} is not an app area shown in reports.`);
  }
  for (const name of declared.subAreas) {
    const concept = exported[name];
    const uiOwner = concept?.kind === 'ui-sub-area' && concept.appAreaIds?.some(id => declaredAreaIds.includes(id));
    if (!uiOwner && !concept?.subAreas?.some(entry => declaredAreaIds.includes(entry.areaId))) {
      issues.push(`${name} is not a sub-area of a declared app area.`);
    }
  }
  for (const list of [declared.appAreas, declared.subAreas]) {
    if (new Set(list).size !== list.length) issues.push('scenarioAreas lists an area more than once.');
  }
  return issues;
}

export function auditScenarioSpec(text: string, registry: DocumentRegistry, filename = 'scenario.spec.ts') {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.ESNext, true);
  const tests = findTestCases(source);
  const issues = scenarioMetadataIssues(source).map(issue => ({ ...issue }));
  try { resolveScenarioDocuments(source.text, registry); }
  catch (error) { issues.push({ line: 1, message: String(error) }); }
  for (const message of scenarioAreaIssues(source)) issues.push({ line: 1, message });
  return { tests, issues };
}
