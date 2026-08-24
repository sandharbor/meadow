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

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  RuntimeBuildPerspective,
  RuntimeChildLaunchCommand,
  RuntimeSupervisorLaunchSpec,
} from "../../../contracts/types/runtime.js";

function parseCommand(value: unknown, field: string): RuntimeChildLaunchCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Runtime launch ${field}`);
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.executable !== "string"
    || candidate.executable.length === 0
    || typeof candidate.cwd !== "string"
    || candidate.cwd.length === 0
    || !Array.isArray(candidate.args)
    || !candidate.args.every(argument => typeof argument === "string")
  ) {
    throw new Error(`Invalid Runtime launch ${field}`);
  }
  if (
    candidate.environment !== undefined
    && (
      !candidate.environment
      || typeof candidate.environment !== "object"
      || Array.isArray(candidate.environment)
      || !Object.values(candidate.environment).every(item => typeof item === "string")
    )
  ) {
    throw new Error(`Invalid Runtime launch ${field}.environment`);
  }
  return {
    executable: candidate.executable,
    args: candidate.args as string[],
    cwd: path.resolve(candidate.cwd),
    ...(candidate.environment
      ? { environment: candidate.environment as Record<string, string> }
      : {}),
  };
}

export function parseRuntimeSupervisorLaunchSpec(value: unknown): RuntimeSupervisorLaunchSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Runtime Supervisor launch spec");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) throw new Error("Unsupported Runtime launch spec schema");
  if (!candidate.payload || typeof candidate.payload !== "object" || Array.isArray(candidate.payload)) {
    throw new Error("Invalid Runtime launch payload");
  }
  const payload = candidate.payload as Record<string, unknown>;
  if (
    typeof candidate.homeDirectory !== "string"
    || typeof payload.identity !== "string"
    || typeof payload.appVersion !== "string"
    || (payload.perspective !== "standalone" && payload.perspective !== "composed")
    || !Number.isInteger(candidate.idleTimeoutMs)
    || Number(candidate.idleTimeoutMs) < 1_000
  ) {
    throw new Error("Invalid Runtime Supervisor launch spec fields");
  }
  return {
    schemaVersion: 1,
    homeDirectory: path.resolve(candidate.homeDirectory),
    payload: {
      identity: payload.identity,
      appVersion: payload.appVersion,
      perspective: payload.perspective as RuntimeBuildPerspective,
    },
    service: parseCommand(candidate.service, "service"),
    web: parseCommand(candidate.web, "web"),
    idleTimeoutMs: Number(candidate.idleTimeoutMs),
  };
}

export function readRuntimeSupervisorLaunchSpec(specPath: string): RuntimeSupervisorLaunchSpec {
  return parseRuntimeSupervisorLaunchSpec(JSON.parse(readFileSync(specPath, "utf8")));
}

export function writeRuntimeSupervisorLaunchSpec(
  specPath: string,
  spec: RuntimeSupervisorLaunchSpec,
): void {
  const validated = parseRuntimeSupervisorLaunchSpec(spec);
  mkdirSync(path.dirname(specPath), { recursive: true, mode: 0o700 });
  writeFileSync(specPath, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
  chmodSync(specPath, 0o600);
}
