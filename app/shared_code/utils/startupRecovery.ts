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
import * as path from 'path';
import { randomUUID } from 'crypto';
import YAML from 'yaml';
import { bootstrapConfigCodec } from './configDocumentCodecs.js';
import type {
  StartupFailureCategory,
  StartupFailureDiagnostic,
  StartupRuntimeBlocker,
} from '../../contracts/types/startupRecovery.js';
import {
  CURRENT_MEADOW_HOME_FORMAT_VERSION,
  OLDEST_UPGRADABLE_MEADOW_HOME_FORMAT_VERSION,
  MeadowHomeCompatibilityError,
} from './meadowHomeFormat.js';
import {
  InvalidDurableDocumentError,
  isPlainObject,
  jsonDocumentCodec,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from './durableDocument.js';

export interface StartupFailureContext {
  selectedHomePath: string;
  bootstrapPath: string;
  appVersion: string;
}

interface IncompleteMigrationLike {
  name: 'IncompleteMigrationError';
  journal: {
    checkpointId?: unknown;
    migrationId?: unknown;
  };
}

interface MigrationLedgerFailureLike {
  name: 'MigrationLedgerConsistencyError';
  ledgerPath: unknown;
}

interface RuntimeUpgradeRequiredLike {
  name: 'RuntimeUpgradeRequiredError';
  ownershipTraceId?: unknown;
  decision: {
    action: 'refuse';
    code: 'runtime-busy';
    leases: {
      clientLeases: number;
      browserSessions: number;
      operationLeases: number;
    };
  };
  descriptor: {
    instanceId: string;
    supervisorPid: number;
    startedAt: string;
    payload: { appVersion: string };
  };
}

interface RuntimeOwnershipBlockedLike {
  name: 'RuntimeOwnershipBlockedError';
  ownershipTraceId?: unknown;
  owner: {
    instanceId: string;
    supervisorPid: number;
  };
}

function isIncompleteMigration(error: unknown): error is IncompleteMigrationLike {
  return error instanceof Error
    && error.name === 'IncompleteMigrationError'
    && 'journal' in error
    && isPlainObject((error as { journal?: unknown }).journal);
}

function isMigrationLedgerFailure(error: unknown): error is Error & MigrationLedgerFailureLike {
  return error instanceof Error
    && error.name === 'MigrationLedgerConsistencyError'
    && 'ledgerPath' in error;
}

function isRuntimeUpgradeRequired(error: unknown): error is Error & RuntimeUpgradeRequiredLike {
  if (!(error instanceof Error)
    || error.name !== 'RuntimeUpgradeRequiredError'
    || !('decision' in error)
    || !('descriptor' in error)
    || !isPlainObject(error.decision)
    || !isPlainObject(error.descriptor)) return false;
  const decision = error.decision;
  const descriptor = error.descriptor;
  return decision.action === 'refuse'
    && decision.code === 'runtime-busy'
    && isPlainObject(decision.leases)
    && Number.isInteger(decision.leases.clientLeases)
    && Number.isInteger(decision.leases.browserSessions)
    && Number.isInteger(decision.leases.operationLeases)
    && typeof descriptor.instanceId === 'string'
    && Number.isInteger(descriptor.supervisorPid)
    && typeof descriptor.startedAt === 'string'
    && isPlainObject(descriptor.payload)
    && typeof descriptor.payload.appVersion === 'string';
}

function isRuntimeOwnershipBlocked(error: unknown): error is Error & RuntimeOwnershipBlockedLike {
  return error instanceof Error
    && error.name === 'RuntimeOwnershipBlockedError'
    && 'owner' in error
    && isPlainObject(error.owner)
    && typeof error.owner.instanceId === 'string'
    && Number.isInteger(error.owner.supervisorPid);
}

function migrationLedgerPaths(homePath: string): string[] {
  const paths = [path.join(homePath, 'migrations.yaml')];
  const providerRoot = path.join(homePath, 'app', 'publishing_providers');
  if (fs.existsSync(providerRoot)) {
    for (const entry of fs.readdirSync(providerRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) paths.push(path.join(providerRoot, entry.name, 'migrations.yaml'));
    }
  }
  return paths;
}

function lastSuccessfulMigration(homePath: string): string | null {
  const records: Array<{ id: string; completedAt: string }> = [];
  for (const ledgerPath of migrationLedgerPaths(homePath)) {
    if (!fs.existsSync(ledgerPath)) continue;
    try {
      const parsed: unknown = YAML.parse(fs.readFileSync(ledgerPath, 'utf8'));
      if (!isPlainObject(parsed)) continue;
      if (Array.isArray(parsed.completedMigrations)) {
        for (const candidate of parsed.completedMigrations) {
          if (isPlainObject(candidate)
            && typeof candidate.id === 'string'
            && typeof candidate.completedAt === 'string') {
            records.push({ id: candidate.id, completedAt: candidate.completedAt });
          }
        }
      } else if (Array.isArray(parsed.completed_migrations)) {
        for (const id of parsed.completed_migrations) {
          if (typeof id === 'string') records.push({ id: id.replace(/\.(?:ts|js)$/, ''), completedAt: '' });
        }
      }
    } catch {
      // A malformed ledger is itself startup evidence; do not guess from it.
    }
  }
  records.sort((left, right) => left.completedAt.localeCompare(right.completedAt));
  return records.at(-1)?.id ?? null;
}

function migrationRecoveryDirectory(homePath: string): string {
  return path.join(homePath, '.meadow-migration-recovery');
}

export function describeStartupFailure(
  error: unknown,
  context: StartupFailureContext,
): StartupFailureDiagnostic {
  let category: StartupFailureCategory = 'startup-failure';
  let title = 'Meadow didn’t open';
  let summary = 'Something unexpected stopped Meadow before it opened. Your Home was left unchanged.';
  let relevantPath: string | null = null;
  let checkpointId: string | null = null;
  let runtimeBlocker: StartupRuntimeBlocker | null = null;

  if (isRuntimeUpgradeRequired(error)) {
    category = 'runtime-busy';
    const { leases } = error.decision;
    if (leases.operationLeases > 0) {
      title = 'Meadow is finishing work in another session';
      summary = 'Another Meadow session is running a background operation. Meadow paused so two copies cannot change this Home at once.';
    } else if (leases.browserSessions > 0) {
      title = 'Meadow is already open in your browser';
      summary = 'The browser session is keeping another copy of Meadow active. You can move this Home into the app now.';
    } else {
      title = 'Another Meadow session is using this Home';
      summary = 'Another Meadow client is using this Home. You can move the Home into this app now.';
    }
    runtimeBlocker = {
      ownershipTraceId: typeof error.ownershipTraceId === 'string'
        ? error.ownershipTraceId
        : null,
      instanceId: error.descriptor.instanceId,
      supervisorPid: error.descriptor.supervisorPid,
      appVersion: error.descriptor.payload.appVersion,
      startedAt: error.descriptor.startedAt,
      clientLeases: leases.clientLeases,
      browserSessions: leases.browserSessions,
      operationLeases: leases.operationLeases,
      sessionAvailable: true,
    };
  } else if (isRuntimeOwnershipBlocked(error)) {
    category = 'runtime-unavailable';
    title = 'A previous Meadow session is still closing';
    summary = 'That session still has exclusive access to this Home, but Meadow can no longer reconnect to it. Meadow will wait rather than opening a second copy.';
    runtimeBlocker = {
      ownershipTraceId: typeof error.ownershipTraceId === 'string'
        ? error.ownershipTraceId
        : null,
      instanceId: error.owner.instanceId,
      supervisorPid: error.owner.supervisorPid,
      appVersion: null,
      startedAt: null,
      clientLeases: 0,
      browserSessions: 0,
      operationLeases: 0,
      sessionAvailable: false,
    };
  } else if (error instanceof InvalidDurableDocumentError) {
    category = error.result.kind === 'syntax' ? 'invalid-syntax' : 'invalid-schema';
    title = error.result.kind === 'syntax'
      ? 'A configuration file has invalid syntax'
      : 'A configuration file does not match its schema';
    summary = 'Meadow preserved the existing file exactly and stopped before replacing it.';
    relevantPath = error.result.path;
  } else if (error instanceof MeadowHomeCompatibilityError) {
    category = error.kind === 'invalid-manifest' || error.kind === 'invalid-legacy-home'
      ? 'invalid-schema'
      : 'unsupported-home-format';
    title = category === 'unsupported-home-format'
      ? 'This Meadow Home is not compatible with this app'
      : 'This Meadow Home could not be validated';
    summary = category === 'unsupported-home-format'
      ? error.message
      : 'Meadow preserved the existing Home exactly and stopped before changing it.';
    relevantPath = error.manifestPath;
  } else if (isIncompleteMigration(error)) {
    category = 'incomplete-migration';
    title = 'A migration needs recovery';
    checkpointId = typeof error.journal.checkpointId === 'string'
      ? error.journal.checkpointId
      : null;
    const migrationId = typeof error.journal.migrationId === 'string'
      ? error.journal.migrationId
      : 'unknown migration';
    summary = `Migration ${migrationId} stopped in an ambiguous state. Meadow will not rerun it blindly.`;
  } else if (isMigrationLedgerFailure(error)) {
    category = 'invalid-schema';
    title = 'Migration history could not be validated';
    summary = 'Meadow preserved the migration ledger exactly and stopped before running a migration.';
    relevantPath = typeof error.ledgerPath === 'string' ? error.ledgerPath : null;
  } else if (error instanceof Error && /checkpoint|Git protection/i.test(error.message)) {
    category = 'checkpoint-failure';
    title = 'Required Git migration protection failed';
    summary = 'Meadow stopped rather than changing the Home without an intact pre-migration Git checkpoint.';
  }

  const checkpointPath = checkpointId
    ? migrationRecoveryDirectory(context.selectedHomePath)
    : null;
  return {
    schemaVersion: 1,
    category,
    title,
    summary,
    selectedHomePath: context.selectedHomePath,
    bootstrapPath: context.bootstrapPath,
    relevantPath,
    appVersion: context.appVersion,
    supportedHomeFormatMinimum: OLDEST_UPGRADABLE_MEADOW_HOME_FORMAT_VERSION,
    supportedHomeFormatMaximum: CURRENT_MEADOW_HOME_FORMAT_VERSION,
    lastSuccessfulMigration: lastSuccessfulMigration(context.selectedHomePath),
    checkpointId,
    checkpointPath,
    checkpointAvailable: checkpointPath !== null
      && fs.existsSync(path.join(context.selectedHomePath, '.git'))
      && fs.existsSync(path.join(checkpointPath, 'checkpoint.json')),
    runtimeBlocker,
  };
}

function validateRuntimeBlocker(value: unknown): value is StartupRuntimeBlocker {
  if (!isPlainObject(value)) return false;
  const fields = new Set([
    'ownershipTraceId', 'instanceId', 'supervisorPid', 'appVersion', 'startedAt', 'clientLeases',
    'browserSessions', 'operationLeases', 'sessionAvailable',
  ]);
  if (Object.keys(value).some(field => !fields.has(field))) return false;
  return (value.ownershipTraceId === undefined
      || value.ownershipTraceId === null
      || typeof value.ownershipTraceId === 'string')
    && typeof value.instanceId === 'string'
    && Number.isInteger(value.supervisorPid)
    && (value.appVersion === null || typeof value.appVersion === 'string')
    && (value.startedAt === null || typeof value.startedAt === 'string')
    && Number.isInteger(value.clientLeases)
    && Number.isInteger(value.browserSessions)
    && Number.isInteger(value.operationLeases)
    && typeof value.sessionAvailable === 'boolean';
}

function validateDiagnostic(value: unknown) {
  if (!isPlainObject(value)) return { valid: false as const, diagnostic: '$ must be an object' };
  const fields = new Set([
    'schemaVersion', 'category', 'title', 'summary', 'selectedHomePath', 'bootstrapPath',
    'relevantPath', 'appVersion', 'supportedHomeFormatMinimum', 'supportedHomeFormatMaximum',
    'lastSuccessfulMigration', 'checkpointId', 'checkpointPath', 'checkpointAvailable',
    'runtimeBlocker',
  ]);
  const unknown = Object.keys(value).filter(field => !fields.has(field));
  if (unknown.length > 0) return { valid: false as const, diagnostic: `$.${unknown[0]} is not supported` };
  if (value.schemaVersion !== 1) return { valid: false as const, diagnostic: '$.schemaVersion must be 1' };
  if (![
    'invalid-syntax', 'invalid-schema', 'unsupported-home-format',
    'incomplete-migration', 'checkpoint-failure', 'runtime-busy',
    'runtime-unavailable', 'startup-failure',
  ].includes(String(value.category))) {
    return { valid: false as const, diagnostic: '$.category is invalid' };
  }
  for (const field of ['title', 'summary', 'selectedHomePath', 'bootstrapPath', 'appVersion']) {
    if (typeof value[field] !== 'string') return { valid: false as const, diagnostic: `$.${field} must be a string` };
  }
  for (const field of ['relevantPath', 'lastSuccessfulMigration', 'checkpointId', 'checkpointPath']) {
    if (value[field] !== null && typeof value[field] !== 'string') {
      return { valid: false as const, diagnostic: `$.${field} must be a string or null` };
    }
  }
  if (!Number.isInteger(value.supportedHomeFormatMinimum)
    || !Number.isInteger(value.supportedHomeFormatMaximum)
    || typeof value.checkpointAvailable !== 'boolean') {
    return { valid: false as const, diagnostic: '$ has invalid compatibility fields' };
  }
  if (value.runtimeBlocker !== undefined
    && value.runtimeBlocker !== null
    && !validateRuntimeBlocker(value.runtimeBlocker)) {
    return { valid: false as const, diagnostic: '$.runtimeBlocker is invalid' };
  }
  return { valid: true as const, value: value as unknown as StartupFailureDiagnostic };
}

export const startupFailureDiagnosticCodec = jsonDocumentCodec<StartupFailureDiagnostic>(validateDiagnostic);

export function writeStartupFailureDiagnostic(
  diagnosticPath: string,
  diagnostic: StartupFailureDiagnostic,
): void {
  writeDurableDocument({
    path: diagnosticPath,
    value: diagnostic,
    codec: startupFailureDiagnosticCodec,
    mode: 0o600,
  });
}

export function readStartupFailureDiagnostic(diagnosticPath: string): StartupFailureDiagnostic | null {
  const result = readDurableDocument(diagnosticPath, startupFailureDiagnosticCodec);
  if (result.status === 'missing') return null;
  return requireValidDocument(result, () => {
    throw new Error('Startup failure diagnostic disappeared');
  });
}

export function startupSupportDiagnosticText(diagnostic: StartupFailureDiagnostic): string {
  return [
    'Meadow startup diagnostic',
    `Category: ${diagnostic.category}`,
    `App version: ${diagnostic.appVersion}`,
    `Supported Home format: ${diagnostic.supportedHomeFormatMinimum}-${diagnostic.supportedHomeFormatMaximum}`,
    `Selected Home: ${diagnostic.selectedHomePath}`,
    `Bootstrap file: ${diagnostic.bootstrapPath}`,
    `Relevant path: ${diagnostic.relevantPath ?? 'none'}`,
    `Last successful migration: ${diagnostic.lastSuccessfulMigration ?? 'none recorded'}`,
    `Pre-migration Git commit: ${diagnostic.checkpointId ?? 'none'}`,
    `Migration recovery available: ${diagnostic.checkpointAvailable ? 'yes' : 'no'}`,
    ...(diagnostic.runtimeBlocker ? [
      `Runtime ownership trace: ${diagnostic.runtimeBlocker.ownershipTraceId ?? 'not recorded'}`,
      `Active Runtime version: ${diagnostic.runtimeBlocker.appVersion ?? 'unknown'}`,
      `Active Runtime clients: ${diagnostic.runtimeBlocker.clientLeases}`,
      `Active browser sessions: ${diagnostic.runtimeBlocker.browserSessions}`,
      `Active operations: ${diagnostic.runtimeBlocker.operationLeases}`,
    ] : []),
    `Summary: ${diagnostic.summary}`,
  ].join('\n');
}

export function selectMeadowHomeForRecovery(
  bootstrapPath: string,
  selectedHomePath: string,
): { selectedHomePath: string; preservedInvalidBootstrapPath: string | null } {
  if (!path.isAbsolute(selectedHomePath)) {
    throw new Error('Selected Meadow Home must be an absolute path');
  }
  const selectedStat = fs.lstatSync(selectedHomePath);
  if (!selectedStat.isDirectory() || selectedStat.isSymbolicLink()) {
    throw new Error('Selected Meadow Home must be a real directory');
  }
  const canonicalHomePath = fs.realpathSync(selectedHomePath);
  const current = readDurableDocument(bootstrapPath, bootstrapConfigCodec);
  if (current.status !== 'invalid') {
    writeDurableDocument({
      path: bootstrapPath,
      value: { meadowHomeDirectoryOverride: canonicalHomePath },
      codec: bootstrapConfigCodec,
      mode: 0o600,
    });
    return { selectedHomePath: canonicalHomePath, preservedInvalidBootstrapPath: null };
  }

  const preservedPath = `${bootstrapPath}.invalid-preserved-${randomUUID()}`;
  fs.mkdirSync(path.dirname(bootstrapPath), { recursive: true, mode: 0o700 });
  fs.renameSync(bootstrapPath, preservedPath);
  try {
    writeDurableDocument({
      path: bootstrapPath,
      value: { meadowHomeDirectoryOverride: canonicalHomePath },
      codec: bootstrapConfigCodec,
      mode: 0o600,
    });
  } catch (error) {
    if (fs.existsSync(bootstrapPath)) fs.unlinkSync(bootstrapPath);
    fs.renameSync(preservedPath, bootstrapPath);
    throw error;
  }
  return { selectedHomePath: canonicalHomePath, preservedInvalidBootstrapPath: preservedPath };
}
