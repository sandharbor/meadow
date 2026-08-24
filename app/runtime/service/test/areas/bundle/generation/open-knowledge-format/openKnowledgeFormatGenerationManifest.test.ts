/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { InvalidDurableDocumentError } from '../../../../../../../shared_code/utils/durableDocument.js';
import {
  getOpenKnowledgeFormatGenerationManifestPath,
  readOpenKnowledgeFormatGenerationManifest,
  removeOpenKnowledgeFormatGenerationManifest,
  writeOpenKnowledgeFormatGenerationManifest,
} from '../../../../../src/areas/bundle/generation/open-knowledge-format/openKnowledgeFormatGenerationManifest.js';

const cleanupPaths: string[] = [];

function temporaryBundle(): string {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-manifest-test-')));
  cleanupPaths.push(directory);
  return path.join(directory, 'bundle');
}

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('Open Knowledge Format generation manifest persistence', () => {
  it('writes deterministically and round-trips a valid manifest', () => {
    const bundle = temporaryBundle();
    const value = {
      renames: [{
        sourcePath: 'index.md',
        originalOutputPath: 'index.md',
        finalOutputPath: 'index--source.md',
        reason: 'reserved-filename' as const,
      }],
      indexOutputPath: 'index.md',
      logOutputPath: null,
    };

    writeOpenKnowledgeFormatGenerationManifest(bundle, value);
    const first = fs.readFileSync(getOpenKnowledgeFormatGenerationManifestPath(bundle));
    writeOpenKnowledgeFormatGenerationManifest(bundle, value);

    expect(fs.readFileSync(getOpenKnowledgeFormatGenerationManifestPath(bundle))).toEqual(first);
    expect(readOpenKnowledgeFormatGenerationManifest(bundle)).toEqual(value);
  });

  it('preserves malformed bytes and refuses to overwrite them', () => {
    const bundle = temporaryBundle();
    const manifestPath = getOpenKnowledgeFormatGenerationManifestPath(bundle);
    const invalid = Buffer.from('{"renames":"not-an-array","private":"FAKE-SECRET"}\n');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, invalid);

    expect(() => readOpenKnowledgeFormatGenerationManifest(bundle)).toThrow(InvalidDurableDocumentError);
    expect(() => removeOpenKnowledgeFormatGenerationManifest(bundle)).toThrow(InvalidDurableDocumentError);
    expect(() => writeOpenKnowledgeFormatGenerationManifest(bundle, {
      renames: [],
      indexOutputPath: 'index.md',
      logOutputPath: null,
    })).toThrow(InvalidDurableDocumentError);
    expect(fs.readFileSync(manifestPath)).toEqual(invalid);
  });
});
