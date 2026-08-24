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

import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  MEADOW_RUNTIME_PROTOCOL,
  RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION,
  type RuntimeBuildPerspective,
  type RuntimeSessionDescriptor,
} from "../../../contracts/types/runtime.js";
import { getRuntimePaths } from "./runtimePaths.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid Runtime Session Descriptor ${field}`);
  }
  return value;
}

function requirePid(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error(`Invalid Runtime Session Descriptor ${field}`);
  }
  return Number(value);
}

function requirePort(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`Invalid Runtime Session Descriptor ${field}`);
  }
  return Number(value);
}

export function parseRuntimeSessionDescriptor(value: unknown): RuntimeSessionDescriptor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Runtime Session Descriptor");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION) {
    throw new Error("Unsupported Runtime Session Descriptor schema");
  }
  if (candidate.protocol !== MEADOW_RUNTIME_PROTOCOL) {
    throw new Error("Unsupported Runtime protocol");
  }
  if (!candidate.payload || typeof candidate.payload !== "object" || Array.isArray(candidate.payload)) {
    throw new Error("Invalid Runtime Session Descriptor payload");
  }

  const payload = candidate.payload as Record<string, unknown>;
  const perspective = requireString(payload.perspective, "payload.perspective");
  if (perspective !== "standalone" && perspective !== "composed") {
    throw new Error("Invalid Runtime Session Descriptor payload.perspective");
  }

  const backendPort = requirePort(candidate.backendPort, "backendPort");
  const frontendPort = requirePort(candidate.frontendPort, "frontendPort");
  const controlPort = requirePort(candidate.controlPort, "controlPort");
  if (new Set([backendPort, frontendPort, controlPort]).size !== 3) {
    throw new Error("Runtime Session Descriptor ports must be distinct");
  }
  const backendUrl = `http://127.0.0.1:${backendPort}/api`;
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  const controlUrl = `http://127.0.0.1:${controlPort}`;
  if (
    candidate.backendUrl !== backendUrl
    || candidate.frontendOrigin !== frontendOrigin
    || candidate.controlUrl !== controlUrl
  ) {
    throw new Error("Runtime Session Descriptor URLs do not match their ports");
  }
  if (candidate.frontendUrl !== `${frontendOrigin}/`) {
    throw new Error("Invalid Runtime Session Descriptor frontendUrl");
  }
  if (
    candidate.state !== "starting"
    && candidate.state !== "ready"
    && candidate.state !== "handoff-requested"
  ) {
    throw new Error("Invalid Runtime Session Descriptor state");
  }

  return {
    schemaVersion: RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION,
    protocol: MEADOW_RUNTIME_PROTOCOL,
    homeDirectory: path.resolve(requireString(candidate.homeDirectory, "homeDirectory")),
    instanceId: requireString(candidate.instanceId, "instanceId"),
    supervisorPid: requirePid(candidate.supervisorPid, "supervisorPid"),
    runtimePid: requirePid(candidate.runtimePid, "runtimePid"),
    controlPort,
    backendPort,
    frontendPort,
    backendUrl,
    controlUrl,
    frontendUrl: `${frontendOrigin}/`,
    frontendOrigin,
    capability: requireString(candidate.capability, "capability"),
    payload: {
      identity: requireString(payload.identity, "payload.identity"),
      appVersion: requireString(payload.appVersion, "payload.appVersion"),
      perspective: perspective as RuntimeBuildPerspective,
    },
    state: candidate.state,
    startedAt: requireString(candidate.startedAt, "startedAt"),
    lastLeaseAt: requireString(candidate.lastLeaseAt, "lastLeaseAt"),
  };
}

export function writeRuntimeSessionDescriptor(
  descriptor: RuntimeSessionDescriptor,
  descriptorPath = getRuntimePaths(descriptor.homeDirectory).sessionDescriptor,
): string {
  const validated = parseRuntimeSessionDescriptor(descriptor);
  const directory = path.dirname(descriptorPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const temporaryPath = path.join(
    directory,
    `.session-${process.pid}-${randomBytes(6).toString("hex")}.tmp`,
  );
  writeFileSync(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporaryPath, descriptorPath);
  chmodSync(descriptorPath, 0o600);
  return descriptorPath;
}

export function readRuntimeSessionDescriptor(descriptorPath: string): RuntimeSessionDescriptor {
  return parseRuntimeSessionDescriptor(JSON.parse(readFileSync(descriptorPath, "utf8")));
}

export function removeRuntimeSessionDescriptor(
  descriptorPath: string,
  expectedInstanceId?: string,
): void {
  if (!existsSync(descriptorPath)) return;
  if (expectedInstanceId !== undefined) {
    const descriptor = readRuntimeSessionDescriptor(descriptorPath);
    if (descriptor.instanceId !== expectedInstanceId) return;
  }
  rmSync(descriptorPath, { force: true });
}

export function removeStaleRuntimeSessionDescriptor(
  descriptorPath: string,
  isProcessAlive: (pid: number) => boolean,
): boolean {
  if (!existsSync(descriptorPath)) return false;
  const descriptor = readRuntimeSessionDescriptor(descriptorPath);
  if (isProcessAlive(descriptor.supervisorPid)) return false;
  removeRuntimeSessionDescriptor(descriptorPath, descriptor.instanceId);
  return true;
}
