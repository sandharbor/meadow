/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import type { AnyMeadowConcept } from '../../../../../concepts/types.js';
import { homeFixtureViolations } from '../../../../../shared_code/shared_dev/savedStates.js';
import { checkSourceChangeCoverage, type SourceChangeCoverageInput } from '../source-change-coverage.js';
import type { ExecutableLintRule } from '../lint-rule.js';
import { homeFixturesRule, sourceChangeCoverageRule, conceptsRule } from './project-rule-definitions.js';

const failure = (error: unknown): string[] => [error instanceof Error ? error.message : String(error)];

export const projectRules: ExecutableLintRule[] = [
  {
    guidance: homeFixturesRule,
    checkExample: example => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-lint-fixture-example-'));
      try {
        const directory = path.join(root, 'app/shared_data/home_fixtures/home_fixture_example');
        fs.mkdirSync(directory, { recursive: true });
        for (const relative of example.code.trim().split('\n').map(line => line.trim()).filter(Boolean)) {
          if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '..' || part === '.')) throw new Error(`Example requires a relative fixture path: ${relative}`);
          const filename = path.join(directory, relative);
          fs.mkdirSync(path.dirname(filename), { recursive: true });
          fs.writeFileSync(filename, relative === 'fixture.yaml' ? 'sourceGraphs: []\n' : '');
        }
        return homeFixtureViolations(root, 'home_fixture_example');
      } catch (error) { return failure(error); }
      finally { fs.rmSync(root, { recursive: true, force: true }); }
    },
  },
  {
    guidance: sourceChangeCoverageRule,
    checkExample: example => {
      try { checkSourceChangeCoverage(JSON.parse(example.code) as SourceChangeCoverageInput); return []; }
      catch (error) { return failure(error); }
    },
  },
  {
    guidance: conceptsRule,
    checkExample: async example => {
      try {
        const [{ loadDocumentRegistry }, { validateConceptRegistry }, { conceptDocument, validateDocuments }, { conceptText, conceptLink }] = await Promise.all([
          import('../../../../../concepts/loadRegistry.js'), import('../../../../../concepts/registry.js'),
          import('../../../../../concepts/documents.js'), import('../../../../../concepts/language.js'),
        ]);
        const registry = await loadDocumentRegistry();
        // Source-owned object literals use the same builders as real definitions.
        const concept = runInNewContext(example.code, { conceptText, conceptLink }, { timeout: 1000 }) as AnyMeadowConcept;
        return [...validateConceptRegistry([...registry.concepts, concept]),
          ...validateDocuments([...registry.documents, conceptDocument(concept)])];
      } catch (error) { return failure(error); }
    },
  },
];
