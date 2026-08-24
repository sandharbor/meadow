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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DurableDocumentLockError,
  InvalidDurableDocumentError,
  deterministicJson,
  extensibleObjectValidation,
  jsonDocumentCodec,
  readDurableDocument,
  writeDurableDocument,
  yamlDocumentCodec,
} from '../../../../../shared_code/utils/durableDocument.js';

interface ExampleDocument {
  name: string;
  unknownFutureField?: unknown;
}

const validateExample = (value: unknown) =>
  extensibleObjectValidation<ExampleDocument>(value, record =>
    typeof record.name === 'string' ? null : '$.name must be a string',
  );
const yamlCodec = yamlDocumentCodec(validateExample);
const jsonCodec = jsonDocumentCodec(validateExample);

describe('durable document persistence', () => {
  let directory: string;
  let target: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-durable-document-'));
    target = path.join(directory, 'document.yaml');
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('distinguishes missing, valid, invalid syntax, and invalid schema', () => {
    expect(readDurableDocument(target, yamlCodec)).toEqual({ status: 'missing', path: target });

    fs.writeFileSync(target, 'name: valid\nfuture: kept\n');
    expect(readDurableDocument(target, yamlCodec)).toMatchObject({
      status: 'valid',
      value: { name: 'valid', future: 'kept' },
    });

    const invalidSyntax = Buffer.from('name: [unterminated\n', 'utf8');
    fs.writeFileSync(target, invalidSyntax);
    const syntaxResult = readDurableDocument(target, yamlCodec);
    expect(syntaxResult).toMatchObject({ status: 'invalid', kind: 'syntax', path: target });
    if (syntaxResult.status === 'invalid') {
      expect(Buffer.from(syntaxResult.recoverableSource)).toEqual(invalidSyntax);
    }

    fs.writeFileSync(target, 'name: 42\n');
    expect(readDurableDocument(target, yamlCodec)).toMatchObject({
      status: 'invalid',
      kind: 'schema',
      diagnostic: '$.name must be a string',
    });
  });

  it('never overwrites or normalizes an invalid existing source', () => {
    const source = Buffer.from('name: [broken\r\n', 'utf8');
    fs.writeFileSync(target, source);

    expect(() =>
      writeDurableDocument({ path: target, value: { name: 'replacement' }, codec: yamlCodec }),
    ).toThrow(InvalidDurableDocumentError);
    expect(fs.readFileSync(target)).toEqual(source);
  });

  it.each([
    ['write', { beforeWrite: () => { throw new Error('injected write failure'); } }],
    ['file flush', { beforeFileFlush: () => { throw new Error('injected flush failure'); } }],
    ['rename', { beforeRename: () => { throw new Error('injected rename failure'); } }],
    [
      'directory flush',
      { beforeDirectoryFlush: () => { throw new Error('injected directory flush failure'); } },
    ],
  ])('leaves the previous bytes intact after an injected %s failure', (_name, faults) => {
    const original = Buffer.from('name: original\nunknownFutureField: keep-me\n', 'utf8');
    fs.writeFileSync(target, original);

    expect(() =>
      writeDurableDocument({
        path: target,
        value: { name: 'replacement' },
        codec: yamlCodec,
        faults,
      }),
    ).toThrow(/injected/);

    expect(fs.readFileSync(target)).toEqual(original);
    expect(fs.readdirSync(directory).filter(name => name.includes('.tmp.'))).toEqual([]);
    expect(fs.existsSync(`${target}.lock`)).toBe(false);
  });

  it('rejects a conflicting writer explicitly without changing the target', () => {
    const original = Buffer.from('name: original\n', 'utf8');
    fs.writeFileSync(target, original);
    fs.writeFileSync(`${target}.lock`, 'held', { mode: 0o600 });

    expect(() =>
      writeDurableDocument({ path: target, value: { name: 'replacement' }, codec: yamlCodec }),
    ).toThrow(DurableDocumentLockError);
    expect(fs.readFileSync(target)).toEqual(original);
  });

  it('writes the target and all staged secret material with mode 0600', () => {
    let observedTemporaryMode: number | undefined;
    writeDurableDocument({
      path: target,
      value: { name: 'secret' },
      codec: yamlCodec,
      mode: 0o600,
      faults: {
        beforeFileFlush: () => {
          const temporary = fs.readdirSync(directory).find(name => name.includes('.tmp.'));
          expect(temporary).toBeDefined();
          observedTemporaryMode = fs.statSync(path.join(directory, temporary!)).mode & 0o777;
        },
      },
    });

    expect(observedTemporaryMode).toBe(0o600);
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  });

  it('serializes deterministically and preserves extensible unknown fields', () => {
    const value = { unknownFutureField: { z: 1, a: 2 }, name: 'same' };
    writeDurableDocument({ path: target, value, codec: yamlCodec });
    const first = fs.readFileSync(target, 'utf8');
    writeDurableDocument({ path: target, value, codec: yamlCodec });
    expect(fs.readFileSync(target, 'utf8')).toBe(first);
    expect(first).toContain('unknownFutureField');

    expect(deterministicJson({ z: 1, nested: { z: 2, a: 3 }, a: 2 })).toBe(
      '{\n  "a": 2,\n  "nested": {\n    "a": 3,\n    "z": 2\n  },\n  "z": 1\n}\n',
    );
  });

  it('rejects an invalid proposed value before creating a target', () => {
    expect(() =>
      writeDurableDocument({
        path: target,
        value: { name: 42 } as unknown as ExampleDocument,
        codec: jsonCodec,
      }),
    ).toThrow('$.name must be a string');
    expect(fs.existsSync(target)).toBe(false);
  });
});
