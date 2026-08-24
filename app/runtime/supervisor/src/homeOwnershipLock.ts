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

import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  HOME_OWNERSHIP_LOCK_SCHEMA_VERSION,
  type HomeOwnershipLockRecord,
} from "../../../contracts/types/runtime.js";
import { getRuntimePaths } from "./runtimePaths.js";

export class MeadowHomeAlreadyOwnedError extends Error {
  constructor(readonly owner: HomeOwnershipLockRecord) {
    super(`Meadow Home is already owned by Runtime Supervisor ${owner.supervisorPid}`);
    this.name = "MeadowHomeAlreadyOwnedError";
  }
}

export interface AcquireHomeOwnershipOptions {
  homeDirectory: string;
  instanceId: string;
  supervisorPid: number;
  payloadIdentity: string;
  runtimeRoot?: string;
  acquiredAt?: string;
  isProcessAlive?: (pid: number) => boolean;
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseLockRecord(value: unknown): HomeOwnershipLockRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Home Ownership Lock");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== HOME_OWNERSHIP_LOCK_SCHEMA_VERSION) {
    throw new Error("Unsupported Home Ownership Lock schema");
  }
  if (typeof candidate.homeDirectory !== "string" || candidate.homeDirectory.length === 0) {
    throw new Error("Invalid Home Ownership Lock homeDirectory");
  }
  if (typeof candidate.instanceId !== "string" || candidate.instanceId.length === 0) {
    throw new Error("Invalid Home Ownership Lock instanceId");
  }
  if (!Number.isInteger(candidate.supervisorPid) || Number(candidate.supervisorPid) < 1) {
    throw new Error("Invalid Home Ownership Lock supervisorPid");
  }
  if (candidate.runtimePid !== null && (!Number.isInteger(candidate.runtimePid) || Number(candidate.runtimePid) < 1)) {
    throw new Error("Invalid Home Ownership Lock runtimePid");
  }
  if (typeof candidate.payloadIdentity !== "string" || candidate.payloadIdentity.length === 0) {
    throw new Error("Invalid Home Ownership Lock payloadIdentity");
  }
  if (typeof candidate.acquiredAt !== "string" || candidate.acquiredAt.length === 0) {
    throw new Error("Invalid Home Ownership Lock acquiredAt");
  }
  return {
    schemaVersion: HOME_OWNERSHIP_LOCK_SCHEMA_VERSION,
    homeDirectory: path.resolve(candidate.homeDirectory),
    instanceId: candidate.instanceId,
    supervisorPid: Number(candidate.supervisorPid),
    runtimePid: candidate.runtimePid === null ? null : Number(candidate.runtimePid),
    payloadIdentity: candidate.payloadIdentity,
    acquiredAt: candidate.acquiredAt,
  };
}

export function readHomeOwnershipLock(lockPath: string): HomeOwnershipLockRecord {
  return parseLockRecord(JSON.parse(readFileSync(lockPath, "utf8")));
}

export class HomeOwnershipLease {
  private released = false;

  constructor(
    readonly path: string,
    readonly record: HomeOwnershipLockRecord,
  ) {}

  updateRuntimePid(runtimePid: number): void {
    if (this.released) throw new Error("Home Ownership Lock was already released");
    const next = parseLockRecord({ ...this.record, runtimePid });
    writeFileSync(this.path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    this.record.runtimePid = runtimePid;
  }

  release(): void {
    if (this.released) return;
    if (existsSync(this.path)) {
      const current = readHomeOwnershipLock(this.path);
      if (current.instanceId === this.record.instanceId) {
        rmSync(this.path, { force: true });
      }
    }
    this.released = true;
  }
}

export function acquireHomeOwnership(options: AcquireHomeOwnershipOptions): HomeOwnershipLease {
  const homeDirectory = path.resolve(options.homeDirectory);
  const runtimePaths = getRuntimePaths(homeDirectory, options.runtimeRoot);
  mkdirSync(runtimePaths.directory, { recursive: true, mode: 0o700 });
  chmodSync(runtimePaths.directory, 0o700);
  const record: HomeOwnershipLockRecord = {
    schemaVersion: HOME_OWNERSHIP_LOCK_SCHEMA_VERSION,
    homeDirectory,
    instanceId: options.instanceId,
    supervisorPid: options.supervisorPid,
    runtimePid: null,
    payloadIdentity: options.payloadIdentity,
    acquiredAt: options.acquiredAt ?? new Date().toISOString(),
  };
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let descriptor: number | null = null;
    try {
      descriptor = openSync(runtimePaths.ownershipLock, "wx", 0o600);
      writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`);
      closeSync(descriptor);
      descriptor = null;
      return new HomeOwnershipLease(runtimePaths.ownershipLock, record);
    } catch (error) {
      if (descriptor !== null) closeSync(descriptor);
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = readHomeOwnershipLock(runtimePaths.ownershipLock);
      if (isProcessAlive(owner.supervisorPid)) throw new MeadowHomeAlreadyOwnedError(owner);
      rmSync(runtimePaths.ownershipLock, { force: true });
    }
  }
  throw new Error("Unable to acquire Home Ownership Lock after stale-owner cleanup");
}
