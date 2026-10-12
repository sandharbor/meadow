/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { existsSync } from 'node:fs';
import path from 'node:path';
import * as coreExports from './index.js';
import * as fixtureExports from '../acceptance/e2e/src/bundle-docs/index.js';
const { allBundleDocs } = fixtureExports;

/** Tooling only: one composition and validation path for reports and acceptance. */
export async function loadDocumentRegistry() {
  let contribution: Record<string, unknown> = {};
  const contributionFile = path.join(import.meta.dirname, 'meadow-extension/index.ts');
  if (existsSync(contributionFile)) {
    const specifier = './meadow-extension/index.ts';
    contribution = await import(specifier) as Record<string, unknown>;
  }
  const contributedConcepts = (contribution.meadowExtensionConcepts ?? []) as readonly coreExports.AnyMeadowConcept[];
  const concepts = [...coreExports.allCoreConcepts, ...contributedConcepts];
  coreExports.assertConceptRegistry(concepts);
  const documents = [
    ...concepts.map(coreExports.conceptDocument), ...coreExports.designPressures,
    ...allBundleDocs.map(coreExports.fixtureDocument),
  ];
  coreExports.assertDocumentRegistry(documents);
  const exportNameToId = new Map<string, string>();
  for (const exports of [coreExports, contribution, fixtureExports]) for (const [name, value] of Object.entries(exports)) {
    if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') exportNameToId.set(name, value.id);
  }
  return {
    concepts, documents, exportNameToId,
    acceptanceConcepts: [...coreExports.acceptanceConcepts, ...contributedConcepts],
    appAreas: coreExports.acceptanceAppAreaConcepts,
    contributedIds: contributedConcepts.map(concept => concept.id),
    pressureIds: coreExports.designPressures.map(pressure => pressure.id) as readonly string[],
    fixtureIds: allBundleDocs.map(fixture => fixture.id),
  };
}

export type DocumentRegistry = Awaited<ReturnType<typeof loadDocumentRegistry>>;
