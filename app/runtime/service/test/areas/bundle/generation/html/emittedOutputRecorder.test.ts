/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BundleNodeId } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import { EmittedOutputRecorder } from '../../../../../src/areas/bundle/generation/html/emittedOutputRecorder.js';

const id = (value: string) => value as BundleNodeId;

describe('emitted output recorder', () => {
  let directory: string;
  const write = (relativePath: string) => {
    fs.mkdirSync(path.dirname(path.join(directory, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(directory, relativePath), relativePath);
  };

  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-recorder-')); });
  afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

  it('keeps the final writer of a path and ignores repeated identical claims', () => {
    const recorder = new EmittedOutputRecorder(directory);
    write('Same.html');
    recorder.claim('Same.html', id('aaaaaaaaaaaa'), 'page');
    recorder.claim('Same.html', id('bbbbbbbbbbbb'), 'page');
    recorder.claim('Same.html', id('bbbbbbbbbbbb'), 'page');
    expect(recorder.owners()).toEqual([{ path: 'Same.html', bundleNodeId: 'bbbbbbbbbbbb', role: 'page' }]);
    expect(recorder.pageOwners()).toEqual(new Map([['Same.html', 'bbbbbbbbbbbb']]));
  });

  it('leaves one role claimed at several paths unowned and omits files that were never emitted', () => {
    const recorder = new EmittedOutputRecorder(directory);
    write('route/Drawing.excalidraw.md');
    write('source/Drawing.excalidraw.md');
    recorder.claim('route/Drawing.excalidraw.md', id('cccccccccccc'), 'drawing-data');
    recorder.claim('source/Drawing.excalidraw.md', id('cccccccccccc'), 'drawing-data');
    recorder.claim('missing.html', id('dddddddddddd'), 'page');
    expect(recorder.owners()).toEqual([]);
  });
});
