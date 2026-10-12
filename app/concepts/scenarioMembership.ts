/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

export interface DocumentScenario {
  conceptIds?: readonly string[];
  appAreaDocIds?: readonly string[];
  subAreaDocIds?: readonly string[];
  bundleDocIds?: readonly string[];
  designPressureIds?: readonly string[];
}

export function scenarioAreaMembership(scenario: DocumentScenario, areas: readonly { id: string; parentId?: string }[]): string[] {
  const ids = new Set(scenario.appAreaDocIds ?? []);
  for (const id of ids) {
    const parent = areas.find(area => area.id === id)?.parentId;
    if (parent) ids.add(parent);
  }
  return [...ids];
}

/** One definition for related counts and document selection; prose is not proof. */
export function scenarioDocumentMembership(scenario: DocumentScenario, areas: readonly { id: string; parentId?: string }[]): string[] {
  return [...new Set([...(scenario.conceptIds ?? []), ...(scenario.subAreaDocIds ?? []),
    ...scenarioAreaMembership(scenario, areas), ...(scenario.bundleDocIds ?? []), ...(scenario.designPressureIds ?? [])])];
}
