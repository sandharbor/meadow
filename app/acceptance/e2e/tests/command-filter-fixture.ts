/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import type { CommandFilterExecution } from '../../../contracts/types/shared/curation/customFilters.js';

export type ExecutionResponse = { status: string; evaluations: CommandFilterExecution[] };
export const commandFilterBundle = 'meadow-test-bundle-big';
export function commandClassifier(home: string) {
  const directory = path.join(home, 'cache', 'command-classifier-fixture');
  fs.mkdirSync(directory, { recursive: true });
  const flag = (name: string, present = true) => {
    const filename = path.join(directory, name);
    if (present) fs.writeFileSync(filename, ''); else fs.rmSync(filename, { force: true });
  };
  return {
    executable: process.execPath,
    args: [path.resolve(import.meta.dirname, '../src/run/fixtures/command-filter.mjs'), directory, '-h'],
    directory, flag,
    started: () => fs.existsSync(path.join(directory, 'started')) ? fs.readdirSync(path.join(directory, 'started')).length : 0,
  };
}
