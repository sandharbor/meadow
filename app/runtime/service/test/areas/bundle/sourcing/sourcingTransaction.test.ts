/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applySourcingTransaction, recoverSourcingTransaction } from '../../../../../../shared_code/utils/sourcingTransaction.js';
import { loadGlobalCustomFilters } from '../../../../../../shared_code/utils/globalCustomFiltersUtils.js';
import { loadAppConfig } from '../../../../../../shared_code/utils/appConfigUtils.js';

let home: string;
function file(relative: string): string { return path.join(home, relative); }
function write(relative: string, contents: string): void {
  fs.mkdirSync(path.dirname(file(relative)), { recursive: true });
  fs.writeFileSync(file(relative), contents);
}
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-source-transaction-')); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

describe('source proposal transaction recovery', () => {
  it('restores all accepted documents and the pending draft when application fails', () => {
    write('bundles/example/config/bundle_config.yaml', 'defaultOutlinksDepth: 2\n');
    write('bundles/example/raw/sourcing/proposal.json', '{"draft":"recover me"}');
    write('app/global_custom_filters.json', '{"filters":[],"version":"1.0.0"}');
    const apply = () => applySourcingTransaction(home, 'example', {
      bundle: 'defaultOutlinksDepth: 5\n', proposal: null, globalFilters: '{"new":"policy"}', nodes: 'new nodes',
    }, { beforeInstall: key => { if (key === 'nodes') throw new Error('Disk failure'); } });
    expect(apply).toThrow('Disk failure');
    expect(fs.readFileSync(file('bundles/example/config/bundle_config.yaml'), 'utf8')).toBe('defaultOutlinksDepth: 2\n');
    expect(fs.readFileSync(file('bundles/example/raw/sourcing/proposal.json'), 'utf8')).toBe('{"draft":"recover me"}');
    expect(loadGlobalCustomFilters(home).filters).toEqual([]);
    expect(fs.existsSync(file('bundles/example/config/bundle_node_config.yaml'))).toBe(false);
    expect(fs.existsSync(file('app/sourcing-transaction.json'))).toBe(false);
  });

  it('recovers a process interruption before another bundle reads shared policy', () => {
    write('app/global_custom_filters.json', '{"partially":"written"}');
    write('app/app_config.yaml', 'deletedDefaultFilterIds: [private]\n');
    write('app/sourcing-transaction.json', JSON.stringify({ version: 1, bundleSlug: 'example', before: {
      globalFilters: '{"filters":[],"version":"1.0.0"}', app: 'version: 1.0.0\n',
      state: '{"acceptedId":"previous"}', proposal: '{"recoverable":true}',
    } }));
    expect(loadGlobalCustomFilters(home)).toEqual({ filters: [], version: '1.0.0' });
    expect(loadAppConfig(home)).toEqual({ version: '1.0.0' });
    expect(fs.readFileSync(file('bundles/example/raw/sourcing/proposal.json'), 'utf8')).toBe('{"recoverable":true}');
    expect(fs.readFileSync(file('bundles/example/raw/sourcing/state.json'), 'utf8')).toBe('{"acceptedId":"previous"}');
    recoverSourcingTransaction(home);
    expect(fs.existsSync(file('app/sourcing-transaction.json'))).toBe(false);
  });

  it('completes the whole transaction and removes only its own proposal', () => {
    write('bundles/example/raw/sourcing/proposal.json', '{}');
    write('bundles/other/raw/sourcing/proposal.json', '{"other":true}');
    applySourcingTransaction(home, 'example', { bundle: 'defaultOutlinksDepth: 3\n', proposal: null, state: '{"acceptedId":"new"}' });
    recoverSourcingTransaction(home);
    expect(fs.readFileSync(file('bundles/example/config/bundle_config.yaml'), 'utf8')).toBe('defaultOutlinksDepth: 3\n');
    expect(fs.existsSync(file('bundles/example/raw/sourcing/proposal.json'))).toBe(false);
    expect(fs.readFileSync(file('bundles/other/raw/sourcing/proposal.json'), 'utf8')).toBe('{"other":true}');
  });

  it('rejects unknown document targets before restoring any bytes', () => {
    write('app/app_config.yaml', 'version: 1.0.0\n');
    write('app/sourcing-transaction.json', JSON.stringify({ version: 1, bundleSlug: 'example', before: { app: 'bad', '../outside': 'bad' } }));
    expect(() => recoverSourcingTransaction(home)).toThrow('Unknown document');
    expect(fs.readFileSync(file('app/app_config.yaml'), 'utf8')).toBe('version: 1.0.0\n');
    expect(fs.existsSync(file('app/sourcing-transaction.json'))).toBe(true);
  });
});
