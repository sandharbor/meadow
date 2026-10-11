/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'path';
import type { GeneratedBundleVersionId } from '../../../../../contracts/types/generatedBundleVersioning.js';
import {
  isPlainObject,
  jsonDocumentCodec,
  readDurableDocument,
  removeDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from '../../../../../shared_code/utils/durableDocument.js';
import { generatedBundleVersionsRoot } from './generatedBundleVersionManifestService.js';
import { generatedBundleVersionOperationsDirectory } from './generatedBundleVersionOperationLock.js';
import type { PriorGenerationRecords } from './generationRecordInstallation.js';

export type VersionOperationType = 'generate-current' | 'create-version';
export type VersionOperationPhase = 'staging' | 'predecessor-backed-up' | 'version-installed' | 'manifest-committed';

interface JournalBase {
  operationId: string;
  operationType: VersionOperationType;
  phase: VersionOperationPhase;
  versionId: GeneratedBundleVersionId;
  predecessorVersionId: GeneratedBundleVersionId | null;
  stagingDirectoryName: string;
  backupDirectoryName: string | null;
}

/** Written before output identity existed, inside the versions root. */
export interface LegacyVersionOperationJournal extends JournalBase {
  schemaVersion: 1;
}

/** Artifact names are relative to the operations directory. */
export interface VersionOperationJournal extends JournalBase {
  schemaVersion: 2;
  recordStagingDirectoryName: string;
  recordBackupDirectoryName: string;
  /** Presence of each touched version's records before the operation. */
  priorRecords: PriorGenerationRecords[];
}

export type AnyVersionOperationJournal = LegacyVersionOperationJournal | VersionOperationJournal;

const JOURNAL_FILENAME = 'operation.json';
const LEGACY_JOURNAL_FILENAME = '.version-operation.json';
const OPERATION_TYPES = ['generate-current', 'create-version'];
const PHASES = ['staging', 'predecessor-backed-up', 'version-installed', 'manifest-committed'];

function validateBase(value: Record<string, unknown>): string | null {
  if (!OPERATION_TYPES.includes(String(value.operationType))) return '$.operationType is invalid';
  if (!PHASES.includes(String(value.phase))) return '$.phase is invalid';
  for (const field of ['operationId', 'versionId', 'stagingDirectoryName']) {
    if (typeof value[field] !== 'string') return `$.${field} must be a string`;
  }
  for (const field of ['predecessorVersionId', 'backupDirectoryName']) {
    if (value[field] !== null && typeof value[field] !== 'string') return `$.${field} must be a string or null`;
  }
  return null;
}

function rejectUnknown(value: Record<string, unknown>, fields: string[]): string | null {
  const known = new Set(fields);
  const unknown = Object.keys(value).find(field => !known.has(field));
  return unknown ? `$.${unknown} is not supported` : null;
}

const BASE_FIELDS = [
  'schemaVersion', 'operationId', 'operationType', 'phase', 'versionId',
  'predecessorVersionId', 'stagingDirectoryName', 'backupDirectoryName',
];

const legacyJournalCodec = jsonDocumentCodec<LegacyVersionOperationJournal>(value => {
  if (!isPlainObject(value)) return { valid: false, diagnostic: '$ must be an object' };
  const diagnostic = rejectUnknown(value, BASE_FIELDS)
    ?? (value.schemaVersion !== 1 ? '$.schemaVersion must be 1' : null)
    ?? validateBase(value);
  return diagnostic ? { valid: false, diagnostic } : { valid: true, value: value as unknown as LegacyVersionOperationJournal };
});

const journalCodec = jsonDocumentCodec<VersionOperationJournal>(value => {
  if (!isPlainObject(value)) return { valid: false, diagnostic: '$ must be an object' };
  const diagnostic = rejectUnknown(value, [...BASE_FIELDS, 'recordStagingDirectoryName', 'recordBackupDirectoryName', 'priorRecords'])
    ?? (value.schemaVersion !== 2 ? '$.schemaVersion must be 2' : null)
    ?? validateBase(value)
    ?? (typeof value.recordStagingDirectoryName !== 'string' ? '$.recordStagingDirectoryName must be a string' : null)
    ?? (typeof value.recordBackupDirectoryName !== 'string' ? '$.recordBackupDirectoryName must be a string' : null)
    ?? (!Array.isArray(value.priorRecords) || !value.priorRecords.every(entry => isPlainObject(entry)
      && typeof entry.versionId === 'string' && typeof entry.inputs === 'boolean' && typeof entry.output === 'boolean')
      ? '$.priorRecords is invalid' : null);
  return diagnostic ? { valid: false, diagnostic } : { valid: true, value: value as unknown as VersionOperationJournal };
});

function journalPath(bundleDirectory: string): string {
  return path.join(generatedBundleVersionOperationsDirectory(bundleDirectory), JOURNAL_FILENAME);
}

export function legacyJournalPath(bundleDirectory: string): string {
  return path.join(generatedBundleVersionsRoot(bundleDirectory), LEGACY_JOURNAL_FILENAME);
}

export function writeJournal(bundleDirectory: string, journal: VersionOperationJournal): void {
  writeDurableDocument({ path: journalPath(bundleDirectory), value: journal, codec: journalCodec });
}

export function removeJournal(bundleDirectory: string, journal: AnyVersionOperationJournal): void {
  removeDurableDocument(journal.schemaVersion === 1 ? legacyJournalPath(bundleDirectory) : journalPath(bundleDirectory));
}

/** The pending journal, preferring the current location over one left by an earlier release. */
export function readJournal(bundleDirectory: string): AnyVersionOperationJournal | null {
  const current = readDurableDocument(journalPath(bundleDirectory), journalCodec);
  if (current.status !== 'missing') {
    return requireValidDocument(current, () => { throw new Error('Generated bundle version journal disappeared'); });
  }
  const legacy = readDurableDocument(legacyJournalPath(bundleDirectory), legacyJournalCodec);
  if (legacy.status === 'missing') return null;
  return requireValidDocument(legacy, () => { throw new Error('Generated bundle version journal disappeared'); });
}

/** Directory against which a journal's artifact names resolve. */
export function journalArtifactRoot(bundleDirectory: string, journal: AnyVersionOperationJournal): string {
  return journal.schemaVersion === 1
    ? generatedBundleVersionsRoot(bundleDirectory)
    : generatedBundleVersionOperationsDirectory(bundleDirectory);
}
