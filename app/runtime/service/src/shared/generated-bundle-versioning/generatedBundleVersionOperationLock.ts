/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import path from 'path';
import { generatedBundleVersionsRoot } from './generatedBundleVersionManifestService.js';

/**
 * Transient lifecycle artifacts (lock, journal, staging, backups, quarantine)
 * live beside the versions root, never inside a directory that Save or
 * publication commits. Meadow Home also ignores this directory.
 */
export const GENERATED_BUNDLE_VERSION_OPERATIONS_DIRECTORY = '.generated_bundle_version_operations';
const LOCK_FILENAME = 'operation.lock';

export class GeneratedBundleVersionOperationConflictError extends Error {
  constructor() {
    super('A conflicting bundle versioning operation is already running');
    this.name = 'GeneratedBundleVersionOperationConflictError';
  }
}

export function generatedBundleVersionOperationsDirectory(bundleDirectory: string): string {
  return path.join(path.dirname(generatedBundleVersionsRoot(bundleDirectory)), GENERATED_BUNDLE_VERSION_OPERATIONS_DIRECTORY);
}

function lockPath(bundleDirectory: string): string {
  return path.join(generatedBundleVersionOperationsDirectory(bundleDirectory), LOCK_FILENAME);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** A lock left by a process that no longer exists cannot protect anything. */
function removeAbandonedLock(filePath: string): boolean {
  let owner: number;
  try {
    owner = Number.parseInt(fs.readFileSync(filePath, 'utf8'), 10);
  } catch {
    return false;
  }
  if (!Number.isInteger(owner) || owner <= 0 || owner === process.pid || processIsAlive(owner)) return false;
  fs.rmSync(filePath, { force: true });
  return true;
}

function acquire(bundleDirectory: string): () => void {
  const filePath = lockPath(bundleDirectory);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let descriptor: number | null = null;
  for (let attempt = 0; attempt < 2 && descriptor === null; attempt++) {
    try {
      descriptor = fs.openSync(filePath, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (attempt > 0 || !removeAbandonedLock(filePath)) throw new GeneratedBundleVersionOperationConflictError();
    }
  }
  fs.writeSync(descriptor!, String(process.pid));
  return () => {
    fs.closeSync(descriptor!);
    fs.rmSync(filePath, { force: true });
  };
}

/**
 * Generation, Save, freeze, restore, cancellation, local deletion, and
 * publication commits install, remove, or commit generated output with its
 * records. They share this exclusive operation so none observes a half pair.
 */
export async function withGeneratedBundleVersionOperation<T>(
  bundleDirectory: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const release = acquire(bundleDirectory);
  try {
    return await operation();
  } finally {
    release();
  }
}

/** True while another operation may be replacing the installed pair. */
export function generatedBundleVersionOperationActive(bundleDirectory: string): boolean {
  return fs.existsSync(lockPath(bundleDirectory));
}

/** Remove a lock only during explicit startup-style recovery outside an operation. */
export function releaseGeneratedBundleVersionOperationLock(bundleDirectory: string): void {
  fs.rmSync(lockPath(bundleDirectory), { force: true });
}
