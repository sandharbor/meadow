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
import { Buffer } from 'buffer';
import { dirname, basename, join } from 'path';
import { randomUUID } from 'crypto';
import YAML from 'yaml';

export type DocumentValidation<T> =
  | { valid: true; value: T }
  | { valid: false; diagnostic: string };

export interface DurableDocumentCodec<T> {
  parse(source: string): unknown;
  validate(value: unknown): DocumentValidation<T>;
  serialize(value: T): string;
}

export type DurableDocumentReadCodec<T = unknown> = Pick<
  DurableDocumentCodec<T>,
  'parse' | 'validate'
>;

export type DurableDocumentResult<T> =
  | { status: 'missing'; path: string }
  | { status: 'valid'; path: string; value: T }
  | {
      status: 'invalid';
      path: string;
      kind: 'syntax' | 'schema';
      diagnostic: string;
      /** Exact source bytes, retained for recovery without lossy decoding. */
      recoverableSource: Uint8Array;
    };

export interface DurableDocumentFaults {
  beforeWrite?: () => void;
  beforeFileFlush?: () => void;
  beforeRename?: () => void;
  beforeDirectoryFlush?: () => void;
}

export interface WriteDurableDocumentOptions<T> {
  path: string;
  value: T;
  codec: DurableDocumentCodec<T>;
  /**
   * Explicitly recognized older schemas that may be replaced atomically by
   * this write. Malformed files still fail closed, and ordinary callers should
   * leave this unset.
   */
  acceptedExistingCodecs?: readonly DurableDocumentReadCodec[];
  mode?: number;
  faults?: DurableDocumentFaults;
}

export class InvalidDurableDocumentError extends Error {
  readonly result: Extract<DurableDocumentResult<unknown>, { status: 'invalid' }>;

  constructor(result: Extract<DurableDocumentResult<unknown>, { status: 'invalid' }>) {
    // Parser diagnostics can echo source lines. Keep them on the typed result
    // for the local recovery surface, but never place them in the ordinary
    // Error message that route and process loggers may record.
    super(`Refusing to modify invalid document at ${result.path} (${result.kind})`);
    this.name = 'InvalidDurableDocumentError';
    this.result = result;
  }
}

export class DurableDocumentLockError extends Error {
  constructor(readonly path: string) {
    super(`Another writer holds the document lock at ${path}`);
    this.name = 'DurableDocumentLockError';
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function readDurableDocument<T>(
  path: string,
  codec: DurableDocumentReadCodec<T>,
): DurableDocumentResult<T> {
  let source: Buffer;
  try {
    source = fs.readFileSync(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { status: 'missing', path };
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = codec.parse(source.toString('utf8'));
  } catch (error) {
    return {
      status: 'invalid',
      path,
      kind: 'syntax',
      diagnostic: diagnostic(error),
      recoverableSource: source,
    };
  }

  const validation = codec.validate(parsed);
  if (!validation.valid) {
    return {
      status: 'invalid',
      path,
      kind: 'schema',
      diagnostic: validation.diagnostic,
      recoverableSource: source,
    };
  }

  return { status: 'valid', path, value: validation.value };
}

export function requireValidDocument<T>(
  result: DurableDocumentResult<T>,
  missingValue: () => T,
): T {
  if (result.status === 'valid') return result.value;
  if (result.status === 'missing') return missingValue();
  throw new InvalidDurableDocumentError(result);
}

function writeAndFlush(path: string, content: Buffer, mode: number, faults?: DurableDocumentFaults): void {
  const descriptor = fs.openSync(path, 'wx', mode);
  try {
    fs.fchmodSync(descriptor, mode);
    faults?.beforeWrite?.();
    fs.writeFileSync(descriptor, content);
    faults?.beforeFileFlush?.();
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

const UNSUPPORTED_DIRECTORY_FLUSH_CODES = new Set([
  'EBADF',
  'EINVAL',
  'EISDIR',
  'ENOTSUP',
  'EPERM',
]);

function flushDirectory(path: string): void {
  let descriptor: number;
  try {
    descriptor = fs.openSync(path, 'r');
  } catch (error) {
    if (UNSUPPORTED_DIRECTORY_FLUSH_CODES.has(errorCode(error) ?? '')) return;
    throw error;
  }
  try {
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!UNSUPPORTED_DIRECTORY_FLUSH_CODES.has(errorCode(error) ?? '')) throw error;
  } finally {
    fs.closeSync(descriptor);
  }
}

/** Flush the containing directory so completed transaction removals survive restart. */
export function removeDurableDocument(path: string): void {
  try { fs.unlinkSync(path); }
  catch (error) { if (errorCode(error) === 'ENOENT') return; throw error; }
  flushDirectory(dirname(path));
}

function uniqueSibling(path: string, purpose: string): string {
  return join(dirname(path), `.${basename(path)}.${purpose}.${process.pid}.${randomUUID()}`);
}

function unlinkIfPresent(path: string): void {
  try {
    fs.unlinkSync(path);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
}

function restorePreviousTarget(
  targetPath: string,
  previous: Buffer | null,
  previousMode: number,
): void {
  if (previous === null) {
    try {
      fs.unlinkSync(targetPath);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    flushDirectory(dirname(targetPath));
    return;
  }

  const rollbackPath = uniqueSibling(targetPath, 'rollback');
  try {
    writeAndFlush(rollbackPath, previous, previousMode);
    fs.renameSync(rollbackPath, targetPath);
    flushDirectory(dirname(targetPath));
  } finally {
    unlinkIfPresent(rollbackPath);
  }
}

/** A dead writer cannot finish its rename. Unknown or live owners remain protected. */
function reclaimDeadDocumentLock(target: string): void {
  const lockPath = `${target}.lock`;
  let owner: unknown;
  let identity: fs.Stats;
  try {
    identity = fs.statSync(lockPath);
    owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch { return; }
  if (!isPlainObject(owner) || !Number.isSafeInteger(owner.pid) || (owner.pid as number) <= 0) return;
  const pid = owner.pid as number;
  try { process.kill(pid, 0); return; }
  catch (error) { if (errorCode(error) !== 'ESRCH') return; }
  const current = fs.statSync(lockPath, { throwIfNoEntry: false });
  if (!current || current.ino !== identity.ino || current.dev !== identity.dev) return;
  unlinkIfPresent(lockPath);
  // Temporary bytes from that exact dead writer are not accepted material.
  for (const name of fs.readdirSync(dirname(target))) {
    if (['tmp', 'rollback', 'lock-owner'].some(purpose => name.startsWith(`.${basename(target)}.${purpose}.${pid}.`))) {
      unlinkIfPresent(join(dirname(target), name));
    }
  }
}

/** Publish a complete owner record atomically, even if the process dies during acquisition. */
function acquireDocumentLock(target: string): string {
  const lockPath = `${target}.lock`;
  const ownerPath = uniqueSibling(target, 'lock-owner');
  try {
    writeAndFlush(ownerPath, Buffer.from(JSON.stringify({ pid: process.pid })), 0o600);
    try { fs.linkSync(ownerPath, lockPath); }
    catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
      reclaimDeadDocumentLock(target);
      try { fs.linkSync(ownerPath, lockPath); }
      catch (retryError) {
        if (errorCode(retryError) === 'EEXIST') throw new DurableDocumentLockError(lockPath);
        throw retryError;
      }
    }
    return lockPath;
  } finally { unlinkIfPresent(ownerPath); }
}

/**
 * Atomically replaces a validated document. All cooperating writers use the
 * adjacent exclusive lock. A malformed current target is never overwritten.
 */
export function writeDurableDocument<T>(options: WriteDurableDocumentOptions<T>): void {
  const mode = options.mode ?? 0o644;
  const targetPath = options.path;
  const directory = dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true });

  const lockPath = acquireDocumentLock(targetPath);
  let temporaryPath: string | null = null;
  try {
    const current = readDurableDocument(targetPath, options.codec);
    if (current.status === 'invalid') {
      const recognizedOlderSchema = options.acceptedExistingCodecs?.some(codec =>
        readDurableDocument(targetPath, codec).status === 'valid'
      ) ?? false;
      if (!recognizedOlderSchema) throw new InvalidDurableDocumentError(current);
    }

    const intended = options.codec.validate(options.value);
    if (!intended.valid) {
      throw new TypeError(`Refusing to write invalid document at ${targetPath}: ${intended.diagnostic}`);
    }

    const serialized = options.codec.serialize(intended.value);
    const reparsed = options.codec.validate(options.codec.parse(serialized));
    if (!reparsed.valid) {
      throw new TypeError(`Serializer produced an invalid document for ${targetPath}: ${reparsed.diagnostic}`);
    }

    let previous: Buffer | null = null;
    let previousMode = mode;
    if (current.status !== 'missing') {
      previous = fs.readFileSync(targetPath);
      previousMode = fs.statSync(targetPath).mode & 0o777;
    }

    temporaryPath = uniqueSibling(targetPath, 'tmp');
    writeAndFlush(temporaryPath, Buffer.from(serialized, 'utf8'), mode, options.faults);
    options.faults?.beforeRename?.();
    fs.renameSync(temporaryPath, targetPath);
    temporaryPath = null;

    try {
      options.faults?.beforeDirectoryFlush?.();
      flushDirectory(directory);
    } catch (error) {
      restorePreviousTarget(targetPath, previous, previousMode);
      throw error;
    }
  } finally {
    if (temporaryPath !== null) {
      unlinkIfPresent(temporaryPath);
    }
    unlinkIfPresent(lockPath);
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sortJsonValue(value[key])]),
    );
  }
  return value;
}

export function deterministicJson(value: unknown): string {
  return `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;
}

export function deterministicYaml(value: unknown): string {
  return YAML.stringify(value, { lineWidth: 0, sortMapEntries: true });
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extensibleObjectValidation<T extends object>(
  value: unknown,
  validateKnownFields?: (value: Record<string, unknown>) => string | null,
): DocumentValidation<T> {
  if (!isPlainObject(value)) return { valid: false, diagnostic: '$ must be an object' };
  const fieldDiagnostic = validateKnownFields?.(value);
  if (fieldDiagnostic) return { valid: false, diagnostic: fieldDiagnostic };
  return { valid: true, value: value as T };
}

export function yamlDocumentCodec<T extends object>(
  validate: (value: unknown) => DocumentValidation<T>,
): DurableDocumentCodec<T> {
  return {
    parse: source => YAML.parse(source),
    validate,
    serialize: deterministicYaml,
  };
}

export function jsonDocumentCodec<T extends object>(
  validate: (value: unknown) => DocumentValidation<T>,
): DurableDocumentCodec<T> {
  return {
    parse: source => JSON.parse(source) as unknown,
    validate,
    serialize: deterministicJson,
  };
}

export const textDocumentCodec: DurableDocumentCodec<string> = {
  parse: source => source,
  validate: value =>
    typeof value === 'string'
      ? { valid: true, value }
      : { valid: false, diagnostic: '$ must be text' },
  serialize: value => value,
};
