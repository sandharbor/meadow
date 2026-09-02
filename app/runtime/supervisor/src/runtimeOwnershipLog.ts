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

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { runtimeHomeId } from "./runtimePaths.js";

export const RUNTIME_OWNERSHIP_LOG_TAG = "[runtime-ownership]";
export const MEADOW_RUNTIME_OWNERSHIP_TRACE_ENV = "MEADOW_RUNTIME_OWNERSHIP_TRACE_ID";
export const MEADOW_RUNTIME_OWNERSHIP_LOG_PATH_ENV = "MEADOW_RUNTIME_OWNERSHIP_LOG_PATH";

type RuntimeOwnershipLogValue = string | number | boolean | null | undefined;

export interface RuntimeOwnershipLogContext {
  homeDirectory: string;
  traceId: string;
  source: string;
  logPath?: string;
  instanceId?: string;
}

export function runtimeOwnershipLogPath(explicitPath?: string): string {
  if (explicitPath) return explicitPath;
  if (process.env[MEADOW_RUNTIME_OWNERSHIP_LOG_PATH_ENV]) {
    return process.env[MEADOW_RUNTIME_OWNERSHIP_LOG_PATH_ENV]!;
  }
  const logDirectory = process.env.MEADOW_LOG_DIRECTORY_OVERRIDE
    ?? path.join(process.env.HOME || process.env.USERPROFILE || "", "Library", "Logs", "Meadow");
  return path.join(logDirectory, "meadow.log");
}

/**
 * Runtime ownership crosses detached client, Supervisor, and recovery
 * processes. These tagged entries join Meadow's existing meadow.log narrative
 * across all of them. Callers must include decisions and outcomes, but never
 * capabilities, launch tokens, browser session IDs, or other credentials.
 */
export function logRuntimeOwnership(
  context: RuntimeOwnershipLogContext,
  event: string,
  details: Record<string, RuntimeOwnershipLogValue> = {},
): void {
  const timestamp = new Date().toISOString();
  const entry = {
    event,
    traceId: context.traceId,
    homeId: runtimeHomeId(context.homeDirectory),
    source: context.source,
    processId: process.pid,
    ...(context.instanceId ? { instanceId: context.instanceId } : {}),
    ...details,
  };
  const line = `${timestamp} - [INFO ] ${RUNTIME_OWNERSHIP_LOG_TAG} ${JSON.stringify(entry)}\n`;
  try {
    const logPath = runtimeOwnershipLogPath(context.logPath);
    mkdirSync(path.dirname(logPath), { recursive: true });
    appendFileSync(logPath, line, { encoding: "utf8" });
  } catch {
    // Ownership logging must never make Runtime recovery less safe.
  }
}
