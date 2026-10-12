/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DocumentRegistry } from '../../../../concepts/loadRegistry.js';
import { assertDocumentRegistry, type MeadowDocument } from '../../../../concepts/documents.js';
import { resolveScenarioDocuments, type ScenarioDocuments } from './scenarioDocuments.js';

export const DOCUMENT_SNAPSHOT_FILE = 'documents.json';
export const SCENARIO_DOCUMENTS_FILE = 'scenario-documents.json';
export interface DeclaredScenarioDocuments extends ScenarioDocuments { testFile: string; scenarioId?: string }
export interface DocumentSnapshot {
  version: 1;
  capturedAt: string;
  documents: readonly MeadowDocument[];
  acceptanceIds: string[];
  contributedIds: readonly string[];
  appAreaIds: string[];
  scenarios: DeclaredScenarioDocuments[];
}

function specFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const file = path.join(directory, name);
    return statSync(file).isDirectory() ? specFiles(file) : file.endsWith('.spec.ts') ? [file] : [];
  });
}

/** Capture the entire declared suite, even for a filtered run. Never rewrite history. */
export function captureDocumentSnapshot(directory: string, registry: DocumentRegistry, testsDirectory: string): DocumentSnapshot {
  const existing = readDocumentSnapshot(directory);
  if (existing) return existing;
  const snapshot: DocumentSnapshot = {
    version: 1, capturedAt: new Date().toISOString(), documents: registry.documents,
    acceptanceIds: registry.acceptanceConcepts.map(concept => concept.id), contributedIds: registry.contributedIds,
    appAreaIds: registry.appAreas.map(area => area.id),
    scenarios: specFiles(testsDirectory).sort().map(file => {
      const source = readFileSync(file, 'utf8');
      return { testFile: path.relative(testsDirectory, file),
        scenarioId: source.match(/type:\s*['"]scenario-id['"],\s*description:\s*['"]([^'"]+)['"]/)?.[1],
        ...resolveScenarioDocuments(source, registry) };
    }),
  };
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, DOCUMENT_SNAPSHOT_FILE), JSON.stringify(snapshot), { flag: 'wx' });
  return snapshot;
}

/** A missing legacy capture is different from a corrupt new capture. */
export function readDocumentSnapshot(directory: string): DocumentSnapshot | undefined {
  const file = path.join(directory, DOCUMENT_SNAPSHOT_FILE);
  if (!existsSync(file)) return undefined;
  const snapshot = JSON.parse(readFileSync(file, 'utf8')) as DocumentSnapshot;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.documents) || !Array.isArray(snapshot.scenarios)
    || !Array.isArray(snapshot.acceptanceIds) || !Array.isArray(snapshot.contributedIds) || !Array.isArray(snapshot.appAreaIds)) {
    throw new Error('Invalid captured document catalog.');
  }
  assertDocumentRegistry(snapshot.documents);
  return snapshot;
}

export function readScenarioDocuments(directory: string): ScenarioDocuments | undefined {
  const file = path.join(directory, SCENARIO_DOCUMENTS_FILE);
  if (!existsSync(file)) return undefined;
  const value = JSON.parse(readFileSync(file, 'utf8')) as ScenarioDocuments;
  for (const key of ['conceptIds', 'bundleDocIds', 'appAreaDocIds', 'subAreaDocIds', 'designPressureIds'] as const) {
    if (!Array.isArray(value[key]) || value[key]!.some(id => typeof id !== 'string')) throw new Error(`Invalid captured ${key}.`);
  }
  return value;
}
