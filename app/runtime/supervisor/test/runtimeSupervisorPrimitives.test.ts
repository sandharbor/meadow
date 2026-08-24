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

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MEADOW_RUNTIME_PROTOCOL,
  RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION,
  type RuntimeSessionDescriptor,
} from "../../../contracts/types/runtime.js";
import { decideRuntimeCompatibility } from "../src/compatibility.js";
import {
  acquireHomeOwnership,
  MeadowHomeAlreadyOwnedError,
} from "../src/homeOwnershipLock.js";
import { getRuntimePaths } from "../src/runtimePaths.js";
import {
  removeStaleRuntimeSessionDescriptor,
  writeRuntimeSessionDescriptor,
} from "../src/sessionDescriptor.js";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "meadow-runtime-supervisor-test-"));
  roots.push(root);
  return root;
}

function descriptor(overrides: Partial<RuntimeSessionDescriptor> = {}): RuntimeSessionDescriptor {
  return {
    schemaVersion: RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION,
    protocol: MEADOW_RUNTIME_PROTOCOL,
    homeDirectory: "/tmp/Meadow Home",
    instanceId: "runtime-a",
    supervisorPid: 101,
    runtimePid: 102,
    controlPort: 41000,
    backendPort: 41001,
    frontendPort: 41002,
    backendUrl: "http://127.0.0.1:41001/api",
    controlUrl: "http://127.0.0.1:41000",
    frontendUrl: "http://127.0.0.1:41002/",
    frontendOrigin: "http://127.0.0.1:41002",
    capability: "test-capability",
    payload: {
      identity: "payload-a",
      appVersion: "0.5.43",
      perspective: "standalone",
    },
    state: "ready",
    startedAt: "2026-08-24T00:00:00.000Z",
    lastLeaseAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Runtime Supervisor ownership primitives", () => {
  it("allows exactly one active Home owner", () => {
    const runtimeRoot = temporaryRoot();
    const first = acquireHomeOwnership({
      homeDirectory: "/tmp/Meadow Home",
      instanceId: "first",
      supervisorPid: 101,
      payloadIdentity: "payload-a",
      runtimeRoot,
      isProcessAlive: pid => pid === 101,
    });

    expect(() => acquireHomeOwnership({
      homeDirectory: "/tmp/Meadow Home",
      instanceId: "second",
      supervisorPid: 202,
      payloadIdentity: "payload-a",
      runtimeRoot,
      isProcessAlive: pid => pid === 101,
    })).toThrow(MeadowHomeAlreadyOwnedError);

    first.release();
  });

  it("recovers a dead owner's lock without treating a descriptor as ownership", () => {
    const runtimeRoot = temporaryRoot();
    const stale = acquireHomeOwnership({
      homeDirectory: "/tmp/Meadow Home",
      instanceId: "stale",
      supervisorPid: 101,
      payloadIdentity: "payload-a",
      runtimeRoot,
      isProcessAlive: () => false,
    });
    expect(existsSync(stale.path)).toBe(true);

    const replacement = acquireHomeOwnership({
      homeDirectory: "/tmp/Meadow Home",
      instanceId: "replacement",
      supervisorPid: 202,
      payloadIdentity: "payload-b",
      runtimeRoot,
      isProcessAlive: () => false,
    });
    expect(replacement.record.instanceId).toBe("replacement");
    replacement.release();
  });

  it("cleans a stale descriptor without releasing a live Home lock", () => {
    const runtimeRoot = temporaryRoot();
    const ownership = acquireHomeOwnership({
      homeDirectory: "/tmp/Meadow Home",
      instanceId: "live-owner",
      supervisorPid: 101,
      payloadIdentity: "payload-a",
      runtimeRoot,
      isProcessAlive: pid => pid === 101,
    });
    const paths = getRuntimePaths("/tmp/Meadow Home", runtimeRoot);
    writeRuntimeSessionDescriptor(descriptor({ supervisorPid: 999 }), paths.sessionDescriptor);

    expect(removeStaleRuntimeSessionDescriptor(paths.sessionDescriptor, () => false)).toBe(true);
    expect(existsSync(paths.sessionDescriptor)).toBe(false);
    expect(existsSync(paths.ownershipLock)).toBe(true);
    ownership.release();
  });
});

describe("Runtime compatibility decisions", () => {
  it("attaches to an identical payload", () => {
    expect(decideRuntimeCompatibility(
      descriptor(),
      {
        protocol: MEADOW_RUNTIME_PROTOCOL,
        payload: { identity: "payload-a", appVersion: "0.5.43", perspective: "standalone" },
      },
      { clientLeases: 1, operationLeases: 0 },
    )).toEqual({ action: "attach", code: "compatible" });
  });

  it("requests cooperative handoff only when the current Runtime is idle", () => {
    expect(decideRuntimeCompatibility(
      descriptor(),
      {
        protocol: MEADOW_RUNTIME_PROTOCOL,
        payload: { identity: "payload-b", appVersion: "0.5.43", perspective: "standalone" },
      },
      { clientLeases: 0, operationLeases: 0 },
    )).toEqual({ action: "handoff", code: "payload-upgrade" });
  });

  it("classifies a protocol mismatch as an upgrade handoff", () => {
    expect(decideRuntimeCompatibility(
      descriptor(),
      {
        protocol: "meadow-local-v2",
        payload: { identity: "payload-a", appVersion: "0.5.43", perspective: "standalone" },
      },
      { clientLeases: 0, operationLeases: 0 },
    )).toEqual({ action: "handoff", code: "protocol-upgrade" });
  });

  it("refuses an incompatible attach while an operation lease is active", () => {
    expect(decideRuntimeCompatibility(
      descriptor(),
      {
        protocol: MEADOW_RUNTIME_PROTOCOL,
        payload: { identity: "payload-b", appVersion: "0.5.43", perspective: "standalone" },
      },
      { clientLeases: 0, operationLeases: 1 },
    )).toMatchObject({ action: "refuse", code: "runtime-busy" });
  });
});
