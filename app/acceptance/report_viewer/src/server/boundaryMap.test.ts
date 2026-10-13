/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readBoundaryMap, boundaryDocument } from './boundaryMap';

describe('area boundary discovery', () => {
  it('resolves aliases and transitive shared declarations, omits private and single-area code, and retains unused public APIs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-map-'));
    const write = (file: string, text: string) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); };
    try {
      write('contracts/types/shared/graph/model.ts', 'export type Key = string; interface Hidden { key: Key }; export interface Graph extends Hidden {}; export type SourcingOnly = number; export const schemaVersion = 2; export const onlyCapability = (value: Graph) => value;');
      write('contracts/types/shared/graph/index.ts', "export { type Graph as RenamedGraph, type SourcingOnly, schemaVersion } from './model.js';");
      write('runtime/service/src/areas/bundle/sourcing/use.ts', "import type { RenamedGraph as G, SourcingOnly } from '../../../../../../contracts/types/shared/graph/index.js'; import { schemaVersion } from '../../../../../../contracts/types/shared/graph/index.js'; export function run(value: G, other: SourcingOnly) { return [value, other, schemaVersion]; }");
      write('runtime/service/src/areas/bundle/generation/use.ts', "import type { Graph } from '../../../../../../contracts/types/shared/graph/model.js'; import { schemaVersion } from '../../../../../../contracts/types/shared/graph/model.js'; export function run(value: Graph) { return [value, schemaVersion]; }");
      write('runtime/service/src/areas/bundle/curation/private.ts', 'export type PrivateCuration = string; export function sourcingQueryGraph() { return 1; }');
      write('runtime/service/src/areas/bundle/curation/exported.ts', "export { sourcingQueryGraph } from './private.js';");
      write('runtime/service/src/tests/ignored.ts', "import type { SourcingOnly } from '../../../../contracts/types/shared/graph/model.js';");
      const result = readBoundaryMap(root);
      const graph = result.entries.find(entry => entry.name === 'Graph');
      expect(graph?.areaIds).toEqual(['bundle/sourcing', 'bundle/generation']);
      expect(graph?.consumers.some(use => use.file.endsWith('sourcing/use.ts'))).toBe(true);
      expect(result.entries.find(entry => entry.name === 'Key')?.areaIds).toEqual(graph?.areaIds);
      expect(result.entries.find(entry => entry.name === 'schemaVersion')?.category).toBe('data');
      expect(result.entries.some(entry => ['PrivateCuration', 'SourcingOnly', 'RenamedGraph', 'Hidden', 'onlyCapability'].includes(entry.name))).toBe(false);
      const api = result.entries.find(entry => entry.name === 'sourcingQueryGraph');
      expect(api?.areaIds).toEqual(['bundle/sourcing', 'bundle/curation']);
      expect(api?.consumers).toEqual([]);
      expect(result.scannedFiles).toBe(6);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it('links current reference documents to stable higher-level explanations', () => {
    const document = boundaryDocument({ id: 'code-boundary/current/path/Key', name: 'Key', category: 'type', areaIds: ['bundle/sourcing', 'bundle/curation'],
      participants: ['bundle/sourcing', 'bundle/curation'], file: 'current/path.ts', line: 12, declaration: 'type Key = string', explanation: 'Current address.', consumers: [] },
    [{ id: 'bundle-node-key', name: 'Bundle Node Key' }]);
    expect(document.documentKind).toBe('code-boundary');
    expect(document.appAreaIds).toEqual(['bundle/sourcing', 'bundle/curation']);
    expect(document.sections[0].blocks[0]).toMatchObject({ items: [{ segments: [{ conceptId: 'bundle-node-key' }] }] });
  });
});
