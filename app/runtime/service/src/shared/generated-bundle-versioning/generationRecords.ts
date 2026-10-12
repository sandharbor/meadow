/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { BundleNodeId } from '../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import {
  GENERATED_OUTPUT_ROLES,
  GENERATION_INPUT_RECORD_SCHEMA_VERSION,
  GENERATION_OUTPUT_RECORD_SCHEMA_VERSION,
  type GeneratedOutputOwnership,
  type GeneratedOutputRole,
  type GenerationInputRecord,
  type GenerationOutputRecord,
  type GenerationRecordState,
  type IncludedSourceEntry,
} from '../../../../../contracts/types/shared/generated-bundle-versioning/generatedOutputIdentity.js';
import { deterministicJson, isPlainObject } from '../../../../../shared_code/utils/durableDocument.js';

/**
 * A generation's local metadata pair: the accepted inputs it captured and the
 * output identity it emitted. Both stay outside the generated website.
 */
export interface GenerationRecordPair {
  inputs: GenerationInputRecord;
  output: GenerationOutputRecord;
}

/** Record contents captured before the output exists. */
export interface CapturedGenerationInputs {
  sourceSnapshotId: string;
  bundleConfig: unknown;
  nodeConfig: string;
  appConfig: unknown;
}

/** What generation reports about the files it emitted. */
export interface EmittedGenerationOutput {
  owners: GeneratedOutputOwnership[];
  includedSources: IncludedSourceEntry[];
}

const GENERATION_INPUTS_DIRECTORY = path.join('raw', 'generation_inputs');
const BUNDLE_NODE_ID_PATTERN = /^[a-z0-9]+$/;
/** Finder metadata is ignored by Meadow Home and never part of a generated result. */
const IGNORED_GENERATED_FILENAMES = new Set(['.DS_Store']);

export function generationRecordsDirectory(bundleDirectory: string): string {
  return path.join(bundleDirectory, GENERATION_INPUTS_DIRECTORY);
}

export function generationRecordFilenames(versionId: string): { inputs: string; output: string } {
  return { inputs: `${versionId}.json`, output: `${versionId}.output.json` };
}

export function generationRecordPaths(bundleDirectory: string, versionId: string): { inputs: string; output: string } {
  const names = generationRecordFilenames(versionId);
  const directory = generationRecordsDirectory(bundleDirectory);
  return { inputs: path.join(directory, names.inputs), output: path.join(directory, names.output) };
}

/** Git's SHA-1 blob ID of exact bytes, matching how Meadow Home commits files. */
export function gitBlobId(content: Buffer): string {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

/** Binds a record to one exact generated file set without storing every hash. */
export function generatedOutputFingerprint(files: ReadonlyMap<string, string>): string {
  const hash = createHash('sha256');
  for (const relativePath of [...files.keys()].sort()) {
    hash.update(relativePath).update('\0').update(files.get(relativePath)!).update('\n');
  }
  return hash.digest('hex');
}

export function isIgnoredGeneratedPath(relativePath: string): boolean {
  return IGNORED_GENERATED_FILENAMES.has(path.posix.basename(relativePath));
}

function workingFilePaths(root: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(root)) return files;
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
        if (!isIgnoredGeneratedPath(relativePath)) files.push(relativePath);
      }
    }
  };
  visit(root);
  return files;
}

/** Relative path → Git blob ID for a generated directory on disk. */
export async function hashGeneratedDirectory(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const paths = workingFilePaths(root);
  const batchSize = 64;
  for (let index = 0; index < paths.length; index += batchSize) {
    const batch = paths.slice(index, index + batchSize);
    const contents = await Promise.all(batch.map(relativePath =>
      fs.promises.readFile(path.join(root, ...relativePath.split('/')))));
    batch.forEach((relativePath, offset) => result.set(relativePath, gitBlobId(contents[offset])));
  }
  return result;
}

/** UI preferences change freely; only settings that affect generated material are inputs. */
export function generationAffectingAppConfig(config: Record<string, unknown>): Record<string, unknown> {
  const otherInputs = new Set(['allowImagesToExtendToFrontier', 'globalStylePresetId', 'disableBaseStyleCss', 'disableBaseJavascriptJs']);
  return Object.fromEntries(Object.entries(config)
    .filter(([key]) => key.startsWith('generation') || otherInputs.has(key))
    .sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeOwners(owners: readonly GeneratedOutputOwnership[]): GeneratedOutputOwnership[] {
  return [...owners]
    .map(owner => ({ path: owner.path, bundleNodeId: owner.bundleNodeId, role: owner.role }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function normalizeIncludedSources(entries: readonly IncludedSourceEntry[]): IncludedSourceEntry[] {
  const unique = new Map<string, IncludedSourceEntry>();
  for (const entry of entries) {
    unique.set(`${entry.sourceId ?? ''}\0${entry.path}`, {
      sourceId: entry.sourceId,
      path: entry.path,
      bundleNodeId: entry.bundleNodeId,
    });
  }
  return [...unique.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([, entry]) => entry);
}

/**
 * Build the record pair for an emitted result. The generation ID is content
 * addressed: regenerating identical output from identical inputs yields the
 * identical pair, while different inputs remain distinct provenance even
 * when their generated bytes match.
 */
export function buildGenerationRecordPair(
  captured: CapturedGenerationInputs,
  emitted: EmittedGenerationOutput,
  files: ReadonlyMap<string, string>,
): GenerationRecordPair {
  const owners = normalizeOwners(emitted.owners);
  const includedSources = normalizeIncludedSources(emitted.includedSources);
  const output = {
    fingerprint: generatedOutputFingerprint(files),
    fileCount: files.size,
    owners,
  };
  const generationId = createHash('sha256')
    .update(deterministicJson({ captured, output, includedSources }))
    .digest('hex')
    .slice(0, 32);
  const pair: GenerationRecordPair = {
    inputs: {
      schemaVersion: GENERATION_INPUT_RECORD_SCHEMA_VERSION,
      generationId,
      sourceSnapshotId: captured.sourceSnapshotId,
      bundleConfig: captured.bundleConfig,
      nodeConfig: captured.nodeConfig,
      appConfig: captured.appConfig,
    },
    output: {
      schemaVersion: GENERATION_OUTPUT_RECORD_SCHEMA_VERSION,
      generationId,
      output,
      includedSources,
    },
  };
  const problem = generationOutputProblem(pair.output, files);
  if (problem) throw new Error(`Generated output identity is invalid: ${problem}`);
  return pair;
}

export function serializeGenerationRecord(record: GenerationInputRecord | GenerationOutputRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

function validRole(value: unknown): value is GeneratedOutputRole {
  return typeof value === 'string' && (GENERATED_OUTPUT_ROLES as readonly string[]).includes(value);
}

function parseOutputRecord(value: Record<string, unknown>): GenerationOutputRecord | string {
  if (typeof value.generationId !== 'string' || !value.generationId) return '$.generationId must be a string';
  const output = value.output;
  if (!isPlainObject(output)) return '$.output must be an object';
  if (typeof output.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(output.fingerprint)) return '$.output.fingerprint is invalid';
  if (typeof output.fileCount !== 'number' || !Number.isInteger(output.fileCount) || output.fileCount < 0) return '$.output.fileCount is invalid';
  if (!Array.isArray(output.owners)) return '$.output.owners must be an array';
  const owners: GeneratedOutputOwnership[] = [];
  for (const [index, owner] of output.owners.entries()) {
    if (!isPlainObject(owner) || typeof owner.path !== 'string' || !owner.path
      || typeof owner.bundleNodeId !== 'string' || !BUNDLE_NODE_ID_PATTERN.test(owner.bundleNodeId) || !validRole(owner.role)) {
      return `$.output.owners[${index}] is invalid`;
    }
    owners.push({ path: owner.path, bundleNodeId: owner.bundleNodeId as BundleNodeId, role: owner.role });
  }
  if (!Array.isArray(value.includedSources)) return '$.includedSources must be an array';
  const includedSources: IncludedSourceEntry[] = [];
  for (const [index, entry] of value.includedSources.entries()) {
    if (!isPlainObject(entry) || typeof entry.path !== 'string'
      || (entry.sourceId !== null && typeof entry.sourceId !== 'string')
      || (entry.bundleNodeId !== null && typeof entry.bundleNodeId !== 'string')) {
      return `$.includedSources[${index}] is invalid`;
    }
    includedSources.push({ sourceId: entry.sourceId, path: entry.path, bundleNodeId: entry.bundleNodeId as BundleNodeId | null });
  }
  return {
    schemaVersion: GENERATION_OUTPUT_RECORD_SCHEMA_VERSION,
    generationId: value.generationId,
    output: { fingerprint: output.fingerprint, fileCount: output.fileCount, owners },
    includedSources,
  };
}

/** Problems that make an output record unusable for its actual files. */
export function generationOutputProblem(
  record: GenerationOutputRecord,
  files: ReadonlyMap<string, string>,
): string | null {
  if (record.output.fileCount !== files.size || record.output.fingerprint !== generatedOutputFingerprint(files)) {
    return 'the generated files do not match their recorded fingerprint';
  }
  const paths = new Set<string>();
  const identities = new Set<string>();
  for (const owner of record.output.owners) {
    if (!files.has(owner.path)) return `recorded output ${owner.path} was not emitted`;
    if (paths.has(owner.path)) return `output ${owner.path} has more than one recorded owner`;
    const identity = `${owner.bundleNodeId}\0${owner.role}`;
    if (identities.has(identity)) return `${owner.bundleNodeId} claims more than one ${owner.role} output`;
    paths.add(owner.path);
    identities.add(identity);
  }
  return null;
}

type ParsedSource =
  | { status: 'missing' }
  | { status: 'invalid'; diagnostic: string }
  | { status: 'object'; value: Record<string, unknown> };

function parseSource(source: string | null): ParsedSource {
  if (source === null) return { status: 'missing' };
  try {
    const value = JSON.parse(source) as unknown;
    return isPlainObject(value) ? { status: 'object', value } : { status: 'invalid', diagnostic: 'the record is not an object' };
  } catch {
    return { status: 'invalid', diagnostic: 'the record is not valid JSON' };
  }
}

export interface ClassifiedGenerationRecords {
  state: GenerationRecordState;
  /** Recorded ownership; present only for a valid supported pair. */
  output: GenerationOutputRecord | null;
  inputs: GenerationInputRecord | null;
}

/**
 * Distinguish a result that predates output identity (Legacy) from metadata
 * written by a newer application (Unsupported) and from a lost, damaged, or
 * mismatched pair (Corrupt). Only a valid pair establishes continuity.
 */
export function classifyGenerationRecords(
  inputsSource: string | null,
  outputSource: string | null,
  files: ReadonlyMap<string, string>,
): ClassifiedGenerationRecords {
  const inputs = parseSource(inputsSource);
  const output = parseSource(outputSource);
  const corrupt = (diagnostic: string): ClassifiedGenerationRecords =>
    ({ state: { kind: 'corrupt', diagnostic }, output: null, inputs: null });

  if (inputs.status === 'invalid') return corrupt(`Generation inputs: ${inputs.diagnostic}`);
  if (output.status === 'invalid') return corrupt(`Generated output identity: ${output.diagnostic}`);
  const inputsVersion = inputs.status === 'object' ? inputs.value.schemaVersion : undefined;
  const outputVersion = output.status === 'object' ? output.value.schemaVersion : undefined;
  if (typeof inputsVersion === 'number' && inputsVersion > GENERATION_INPUT_RECORD_SCHEMA_VERSION) {
    return { state: { kind: 'unsupported', diagnostic: `Generation inputs use schema ${inputsVersion}, which this version of Meadow cannot interpret.` }, output: null, inputs: null };
  }
  if (typeof outputVersion === 'number' && outputVersion > GENERATION_OUTPUT_RECORD_SCHEMA_VERSION) {
    return { state: { kind: 'unsupported', diagnostic: `Generated output identity uses schema ${outputVersion}, which this version of Meadow cannot interpret.` }, output: null, inputs: null };
  }

  const inputsRequireOutput = inputs.status === 'object' && inputsVersion !== undefined;
  if (output.status === 'missing') {
    if (inputsRequireOutput) return corrupt('The generated output identity record is missing.');
    return { state: { kind: 'legacy' }, output: null, inputs: null };
  }
  if (inputs.status === 'missing' || !inputsRequireOutput) {
    return corrupt('The generation inputs record is missing or predates its output identity record.');
  }
  if (inputsVersion !== GENERATION_INPUT_RECORD_SCHEMA_VERSION) return corrupt('Generation inputs have an invalid schema version.');
  if (outputVersion !== GENERATION_OUTPUT_RECORD_SCHEMA_VERSION) return corrupt('Generated output identity has an invalid schema version.');
  if (typeof inputs.value.generationId !== 'string' || typeof inputs.value.sourceSnapshotId !== 'string'
    || typeof inputs.value.nodeConfig !== 'string') {
    return corrupt('Generation inputs are incomplete.');
  }
  const parsedOutput = parseOutputRecord(output.value);
  if (typeof parsedOutput === 'string') return corrupt(`Generated output identity: ${parsedOutput}`);
  if (parsedOutput.generationId !== inputs.value.generationId) {
    return corrupt('Generation inputs and output identity belong to different generations.');
  }
  const problem = generationOutputProblem(parsedOutput, files);
  if (problem) return corrupt(`Generated output identity: ${problem}`);
  return {
    state: { kind: 'valid' },
    output: parsedOutput,
    inputs: inputs.value as unknown as GenerationInputRecord,
  };
}

/** Current on-disk record sources for one version. */
export function readWorkingGenerationRecordSources(
  bundleDirectory: string,
  versionId: string,
): { inputs: string | null; output: string | null } {
  const paths = generationRecordPaths(bundleDirectory, versionId);
  const read = (filePath: string): string | null => {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  };
  return { inputs: read(paths.inputs), output: read(paths.output) };
}

import type { ParticipatesIn, generationRecord } from '../../../../../concepts/index.js';
export type GenerationRecordMeadowConceptParticipations = [
  ParticipatesIn<typeof generationRecord, 'record', typeof buildGenerationRecordPair>,
  ParticipatesIn<typeof generationRecord, 'classify', typeof classifyGenerationRecords>,
];
