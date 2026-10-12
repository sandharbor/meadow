/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import path from 'path';
import type { GeneratedBundleVersionId } from '../../../../../contracts/types/shared/generated-bundle-versioning/generatedBundleVersioning.js';
import { textDocumentCodec, writeDurableDocument } from '../../../../../shared_code/utils/durableDocument.js';
import {
  generationRecordFilenames,
  generationRecordPaths,
  generationRecordsDirectory,
  serializeGenerationRecord,
  type GenerationRecordPair,
} from './generationRecords.js';

/** Whether each record file existed before an operation touched it. */
export interface PriorGenerationRecords {
  versionId: GeneratedBundleVersionId;
  inputs: boolean;
  output: boolean;
}

export function priorGenerationRecords(bundleDirectory: string, versionId: GeneratedBundleVersionId): PriorGenerationRecords {
  const paths = generationRecordPaths(bundleDirectory, versionId);
  return { versionId, inputs: fs.existsSync(paths.inputs), output: fs.existsSync(paths.output) };
}

/** Copy existing records aside before anything replaces or removes them. */
export function backupGenerationRecords(
  bundleDirectory: string,
  prior: readonly PriorGenerationRecords[],
  backupDirectory: string,
): void {
  fs.mkdirSync(backupDirectory, { recursive: true });
  for (const entry of prior) {
    const paths = generationRecordPaths(bundleDirectory, entry.versionId);
    const names = generationRecordFilenames(entry.versionId);
    if (entry.inputs) fs.copyFileSync(paths.inputs, path.join(backupDirectory, names.inputs));
    if (entry.output) fs.copyFileSync(paths.output, path.join(backupDirectory, names.output));
  }
}

export function stageGenerationRecords(
  pair: GenerationRecordPair,
  versionId: GeneratedBundleVersionId,
  stagingDirectory: string,
): void {
  fs.mkdirSync(stagingDirectory, { recursive: true });
  const names = generationRecordFilenames(versionId);
  fs.writeFileSync(path.join(stagingDirectory, names.inputs), serializeGenerationRecord(pair.inputs));
  fs.writeFileSync(path.join(stagingDirectory, names.output), serializeGenerationRecord(pair.output));
}

/** Install a validated staged pair; each rename atomically replaces its file. */
export function installStagedGenerationRecords(
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
  stagingDirectory: string,
): void {
  fs.mkdirSync(generationRecordsDirectory(bundleDirectory), { recursive: true });
  const names = generationRecordFilenames(versionId);
  const paths = generationRecordPaths(bundleDirectory, versionId);
  fs.renameSync(path.join(stagingDirectory, names.output), paths.output);
  fs.renameSync(path.join(stagingDirectory, names.inputs), paths.inputs);
}

/**
 * Return records to the presence and bytes captured before an operation. A
 * record that existed but has no backup was never touched, so it stays.
 */
export function restoreGenerationRecordsFromBackup(
  bundleDirectory: string,
  prior: readonly PriorGenerationRecords[],
  backupDirectory: string | null,
): void {
  for (const entry of prior) {
    const paths = generationRecordPaths(bundleDirectory, entry.versionId);
    const names = generationRecordFilenames(entry.versionId);
    for (const [existed, filePath, name] of [
      [entry.inputs, paths.inputs, names.inputs],
      [entry.output, paths.output, names.output],
    ] as const) {
      if (!existed) {
        fs.rmSync(filePath, { force: true });
        continue;
      }
      const backup = backupDirectory ? path.join(backupDirectory, name) : null;
      if (backup && fs.existsSync(backup)) {
        writeDurableDocument({ path: filePath, value: fs.readFileSync(backup, 'utf8'), codec: textDocumentCodec });
      }
    }
  }
}

export function removeGenerationRecords(bundleDirectory: string, versionId: GeneratedBundleVersionId): void {
  const paths = generationRecordPaths(bundleDirectory, versionId);
  fs.rmSync(paths.output, { force: true });
  fs.rmSync(paths.inputs, { force: true });
}
