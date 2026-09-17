/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importExtensionModule } from '../../../src/shared/module-loading/importExtensionModule.js';

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'module-discovery-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });
function write(relative: string): string {
  const file = path.join(directory, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'export const discovered = true;');
  return file;
}

describe('infrastructure module discovery respects area boundaries', () => {
  it('loads a discovered extension outside the application areas', async () => {
    expect(await importExtensionModule(write('provider/entry.mjs'))).toMatchObject({ discovered: true });
  });
  it.each(['src/areas/bundle/curation/exported.mjs', 'src/shared/app-shell/bridge.mjs'])(
    'rejects %s rather than allowing dynamic access around the static interface check', async relative => {
      await expect(importExtensionModule(write(relative))).rejects.toThrow(/Dynamic discovery cannot load/);
    },
  );
  it('resolves symlinks before deciding whether the target belongs to an area', async () => {
    const target = write('src/areas/bundle/sourcing/internal.mjs');
    const alias = path.join(directory, 'disguised.mjs');
    fs.symlinkSync(target, alias);
    await expect(importExtensionModule(alias)).rejects.toThrow(/Dynamic discovery cannot load/);
  });
});
