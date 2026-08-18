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

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findRandomPort } from "./portUtils.js";

export const MEADOW_CONTROL_PROTOCOL = "meadow-local-v1";
export const MEADOW_RUNTIME_SESSION_ENV = "MEADOW_RUNTIME_SESSION_PATH";
export const LOCAL_RUNTIME_SESSION_SCHEMA_VERSION = 1;

export interface LocalRuntimeSession {
  schemaVersion: typeof LOCAL_RUNTIME_SESSION_SCHEMA_VERSION;
  protocol: typeof MEADOW_CONTROL_PROTOCOL;
  homeDirectory: string;
  ownerPid: number;
  backendPort: number;
  frontendPort: number;
  backendUrl: string;
  frontendUrl: string;
  frontendOrigin: string;
  capability: string;
  createdAt: string;
}

export interface CreateLocalRuntimeSessionOptions {
  homeDirectory: string;
  ownerPid?: number;
  backendPort?: number;
  frontendPort?: number;
  capability?: string;
  sessionPath?: string;
}

function requirePort(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`Invalid local runtime ${field}`);
  }
  return Number(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid local runtime ${field}`);
  }
  return value;
}

function parseRuntimeSession(value: unknown): LocalRuntimeSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid local runtime session");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== LOCAL_RUNTIME_SESSION_SCHEMA_VERSION) {
    throw new Error("Unsupported local runtime session schema");
  }
  if (candidate.protocol !== MEADOW_CONTROL_PROTOCOL) {
    throw new Error("Unsupported local runtime protocol");
  }

  const backendPort = requirePort(candidate.backendPort, "backendPort");
  const frontendPort = requirePort(candidate.frontendPort, "frontendPort");
  if (backendPort === frontendPort) {
    throw new Error("Local runtime ports must be distinct");
  }
  const backendUrl = requireString(candidate.backendUrl, "backendUrl");
  const frontendUrl = requireString(candidate.frontendUrl, "frontendUrl");
  const frontendOrigin = requireString(candidate.frontendOrigin, "frontendOrigin");
  const expectedBackendUrl = `http://127.0.0.1:${backendPort}/api`;
  const expectedFrontendOrigin = `http://127.0.0.1:${frontendPort}`;
  if (backendUrl !== expectedBackendUrl || frontendOrigin !== expectedFrontendOrigin) {
    throw new Error("Local runtime URLs do not match their ports");
  }
  if (frontendUrl !== `${expectedFrontendOrigin}/`) {
    throw new Error("Invalid local runtime frontendUrl");
  }

  return {
    schemaVersion: LOCAL_RUNTIME_SESSION_SCHEMA_VERSION,
    protocol: MEADOW_CONTROL_PROTOCOL,
    homeDirectory: path.resolve(requireString(candidate.homeDirectory, "homeDirectory")),
    ownerPid: Number.isInteger(candidate.ownerPid) && Number(candidate.ownerPid) >= 0
      ? Number(candidate.ownerPid)
      : 0,
    backendPort,
    frontendPort,
    backendUrl,
    frontendUrl,
    frontendOrigin,
    capability: requireString(candidate.capability, "capability"),
    createdAt: requireString(candidate.createdAt, "createdAt"),
  };
}

export function getLocalRuntimeSessionPath(homeDirectory: string): string {
  const resolvedHome = path.resolve(homeDirectory);
  const homeId = createHash("sha256").update(resolvedHome).digest("hex").slice(0, 24);
  return path.join(tmpdir(), "meadow-runtime", homeId, "session.json");
}

export function getLocalRuntimeStartupDiagnosticPath(sessionPath: string): string {
  return path.join(path.dirname(sessionPath), "startup-failure.json");
}

export function writeLocalRuntimeSession(
  session: LocalRuntimeSession,
  sessionPath = getLocalRuntimeSessionPath(session.homeDirectory),
): string {
  const validated = parseRuntimeSession(session);
  const directory = path.dirname(sessionPath);
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
  renameSync(temporaryPath, sessionPath);
  chmodSync(sessionPath, 0o600);
  return sessionPath;
}

export function readLocalRuntimeSession(sessionPath: string): LocalRuntimeSession {
  const parsed = JSON.parse(readFileSync(sessionPath, "utf8")) as unknown;
  return parseRuntimeSession(parsed);
}

export function readLocalRuntimeSessionFromEnvironment(): LocalRuntimeSession | null {
  const sessionPath = process.env[MEADOW_RUNTIME_SESSION_ENV];
  return sessionPath ? readLocalRuntimeSession(sessionPath) : null;
}

export function removeLocalRuntimeSession(
  sessionPath: string,
  expectedOwnerPid?: number,
): void {
  if (!existsSync(sessionPath)) return;
  if (expectedOwnerPid !== undefined) {
    const session = readLocalRuntimeSession(sessionPath);
    if (session.ownerPid !== expectedOwnerPid) return;
  }
  rmSync(sessionPath, { force: true });
}

export async function createLocalRuntimeSession(
  options: CreateLocalRuntimeSessionOptions,
): Promise<{ session: LocalRuntimeSession; sessionPath: string }> {
  const backendPort = options.backendPort ?? await findRandomPort();
  let frontendPort = options.frontendPort ?? await findRandomPort();
  while (frontendPort === backendPort) {
    frontendPort = await findRandomPort();
  }
  requirePort(backendPort, "backendPort");
  requirePort(frontendPort, "frontendPort");

  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  const session: LocalRuntimeSession = {
    schemaVersion: LOCAL_RUNTIME_SESSION_SCHEMA_VERSION,
    protocol: MEADOW_CONTROL_PROTOCOL,
    homeDirectory: path.resolve(options.homeDirectory),
    ownerPid: options.ownerPid ?? process.pid,
    backendPort,
    frontendPort,
    backendUrl: `http://127.0.0.1:${backendPort}/api`,
    frontendUrl: `${frontendOrigin}/`,
    frontendOrigin,
    capability: options.capability ?? randomBytes(32).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
  const sessionPath = writeLocalRuntimeSession(
    session,
    options.sessionPath ?? getLocalRuntimeSessionPath(session.homeDirectory),
  );
  return { session, sessionPath };
}
