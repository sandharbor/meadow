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
import { afterEach, describe, expect, it } from 'vitest';
import { InvalidDurableDocumentError, readDurableDocument } from '../../../../shared_code/utils/durableDocument.js';
import { MigrationLedgerConsistencyError } from '../../../src/shared/migrations/migrationPersistence.js';
import { bootstrapConfigCodec } from '../../../../shared_code/utils/configDocumentCodecs.js';
import {
  describeStartupFailure,
  selectMeadowHomeForRecovery,
  startupSupportDiagnosticText,
} from '../../../../shared_code/utils/startupRecovery.js';
import { MeadowHomeCompatibilityError } from '../../../../shared_code/utils/meadowHomeFormat.js';
import { renderStartupRecoveryHtml } from '../../../../shared_code/utils/startupRecoveryHtml.js';

const cleanupPaths: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'startup-recovery-test-')));
  cleanupPaths.push(directory);
  return directory;
}

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('startup recovery diagnostics', () => {
  it('escapes diagnostic values before rendering the recovery surface', () => {
    const markup = '<img src=x onerror="globalThis.compromised=true">';
    const html = renderStartupRecoveryHtml({
      schemaVersion: 1,
      category: 'invalid-syntax',
      title: markup,
      summary: `Summary ${markup}`,
      selectedHomePath: `/tmp/Home ${markup}`,
      bootstrapPath: '/tmp/bootstrap_config.yaml',
      relevantPath: null,
      appVersion: '0.5.41',
      supportedHomeFormatMinimum: 0,
      supportedHomeFormatMaximum: 1,
      lastSuccessfulMigration: null,
      checkpointId: null,
      checkpointPath: null,
      checkpointAvailable: false,
    });

    expect(html).not.toContain(markup);
    expect(html).toContain('&lt;img src=x onerror=&quot;globalThis.compromised=true&quot;&gt;');
    expect(html).not.toContain('data-recovery-action="restore"');
  });

  it('classifies invalid documents without copying source bytes or secrets into support text', () => {
    const root = temporaryDirectory();
    const secret = 'FAKE-SECRET-MUST-NOT-LEAK';
    const secretPath = path.join(root, 'pp_secrets.yaml');
    const error = new InvalidDurableDocumentError({
      status: 'invalid',
      path: secretPath,
      kind: 'syntax',
      diagnostic: `parser saw ${secret}`,
      recoverableSource: Buffer.from(`accessToken: ${secret}`),
    });
    const diagnostic = describeStartupFailure(error, {
      selectedHomePath: path.join(root, 'Home'),
      bootstrapPath: path.join(root, 'bootstrap_config.yaml'),
      appVersion: '0.5.41',
    });
    const supportText = startupSupportDiagnosticText(diagnostic);
    expect(diagnostic.category).toBe('invalid-syntax');
    expect(supportText).not.toContain(secret);
    expect(supportText).not.toContain('accessToken');
    expect(supportText).toContain(secretPath);
  });

  it('does not copy malformed Home parser details into a support diagnostic', () => {
    const root = temporaryDirectory();
    const secret = 'FAKE-HOME-PARSER-SECRET-MUST-NOT-LEAK';
    const manifestPath = path.join(root, 'Home', 'meadow_home.yaml');
    const error = new MeadowHomeCompatibilityError(
      'invalid-manifest',
      `Parser echoed ${secret}`,
      path.dirname(manifestPath),
      manifestPath,
    );
    const diagnostic = describeStartupFailure(error, {
      selectedHomePath: path.dirname(manifestPath),
      bootstrapPath: path.join(root, 'bootstrap_config.yaml'),
      appVersion: '0.5.41',
    });
    expect(startupSupportDiagnosticText(diagnostic)).not.toContain(secret);
    expect(diagnostic.category).toBe('invalid-schema');
  });

  it('classifies an inconsistent migration ledger without exposing its detailed cause', () => {
    const root = temporaryDirectory();
    const ledgerPath = path.join(root, 'Home', 'migrations.yaml');
    const secret = 'FAKE-LEDGER-DETAIL-MUST-NOT-LEAK';
    const diagnostic = describeStartupFailure(
      new MigrationLedgerConsistencyError(ledgerPath, `unknown logical ID ${secret}`),
      {
        selectedHomePath: path.dirname(ledgerPath),
        bootstrapPath: path.join(root, 'bootstrap_config.yaml'),
        appVersion: '0.5.41',
      },
    );
    expect(diagnostic).toMatchObject({
      category: 'invalid-schema',
      title: 'Migration history could not be validated',
      relevantPath: ledgerPath,
    });
    expect(startupSupportDiagnosticText(diagnostic)).not.toContain(secret);
  });

  it('reports an available checkpoint and the last successful migration', () => {
    const root = temporaryDirectory();
    const home = path.join(root, 'Home');
    const checkpointId = 'migration-checkpoint-id';
    fs.mkdirSync(path.join(root, '.Home.meadow-recovery', 'checkpoints', checkpointId), { recursive: true });
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(home, 'migrations.yaml'), [
      'schemaVersion: 1',
      'scope: core',
      'lastApplicationVersion: 0.5.41',
      'completedMigrations:',
      '  - id: first-migration',
      '    completedAt: 2026-08-17T00:00:00.000Z',
      '    applicationVersion: 0.5.41',
      '',
    ].join('\n'));
    const providerLedger = path.join(
      home,
      'app',
      'publishing_providers',
      'ExamplePublishingProvider',
      'migrations.yaml',
    );
    fs.mkdirSync(path.dirname(providerLedger), { recursive: true });
    fs.writeFileSync(providerLedger, [
      'schemaVersion: 1',
      'scope: ExamplePublishingProvider',
      'lastApplicationVersion: 0.5.41',
      'completedMigrations:',
      '  - id: provider-migration',
      '    completedAt: 2026-08-17T01:00:00.000Z',
      '    applicationVersion: 0.5.41',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(
      root,
      '.Home.meadow-recovery',
      'checkpoints',
      checkpointId,
      'checkpoint.json',
    ), '{}');
    const error = Object.assign(new Error('ambiguous'), {
      name: 'IncompleteMigrationError',
      journal: { checkpointId, migrationId: 'second-migration' },
    });
    const diagnostic = describeStartupFailure(error, {
      selectedHomePath: home,
      bootstrapPath: path.join(root, 'bootstrap_config.yaml'),
      appVersion: '0.5.41',
    });
    expect(diagnostic.category).toBe('incomplete-migration');
    expect(diagnostic.lastSuccessfulMigration).toBe('provider-migration');
    expect(diagnostic.checkpointAvailable).toBe(true);
  });
});

describe('choosing another Home from recovery', () => {
  it('preserves an invalid bootstrap byte-for-byte before writing the explicit selection', () => {
    const root = temporaryDirectory();
    const bootstrapPath = path.join(root, 'config', 'bootstrap_config.yaml');
    const selectedHome = path.join(root, 'Selected Home');
    fs.mkdirSync(path.dirname(bootstrapPath));
    fs.mkdirSync(selectedHome);
    const invalidBytes = Buffer.from('meadowHomeDirectoryOverride: [unterminated\n');
    fs.writeFileSync(bootstrapPath, invalidBytes, { mode: 0o640 });

    const result = selectMeadowHomeForRecovery(bootstrapPath, selectedHome);
    expect(result.preservedInvalidBootstrapPath).not.toBeNull();
    expect(fs.readFileSync(result.preservedInvalidBootstrapPath!)).toEqual(invalidBytes);
    const selected = readDurableDocument(bootstrapPath, bootstrapConfigCodec);
    expect(selected.status).toBe('valid');
    if (selected.status === 'valid') {
      expect(selected.value.meadowHomeDirectoryOverride).toBe(fs.realpathSync(selectedHome));
    }
    expect(fs.statSync(bootstrapPath).mode & 0o777).toBe(0o600);
  });
});
