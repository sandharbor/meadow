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

import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  MEADOW_RUNTIME_PROTOCOL,
  type RuntimeCompatibilityDecision,
  type RuntimePayloadReference,
  type RuntimeSessionDescriptor,
  type RuntimeSupervisorLaunchSpec,
} from "../../../contracts/types/runtime.js";
import { readHomeOwnershipLock } from "./homeOwnershipLock.js";
import { writeRuntimeSupervisorLaunchSpec } from "./launchSpec.js";
import { getRuntimePaths } from "./runtimePaths.js";
import {
  readRuntimeSessionDescriptor,
  removeStaleRuntimeSessionDescriptor,
} from "./sessionDescriptor.js";

export class RuntimeUpgradeRequiredError extends Error {
  constructor(readonly decision: RuntimeCompatibilityDecision) {
    super(decision.action === "refuse"
      ? decision.message
      : "The active Runtime must be upgraded before this client can attach.");
    this.name = "RuntimeUpgradeRequiredError";
  }
}

export interface EnsureRuntimeOptions {
  homeDirectory: string;
  payload: RuntimePayloadReference;
  launchSpec: RuntimeSupervisorLaunchSpec;
  supervisorEntryPath: string;
  runtimeRoot?: string;
  descriptorPath?: string;
  nodeExecutable?: string;
  clientLeaseId?: string;
  startupTimeoutMs?: number;
  supervisorStdio?: StdioOptions;
  supervisorEnvironment?: NodeJS.ProcessEnv;
  detachedSupervisor?: boolean;
  spawnSupervisor?: typeof spawn;
  isProcessAlive?: (pid: number) => boolean;
}

interface ControlResponse {
  response: Response;
  body: Record<string, unknown>;
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function readControlResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json() as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function postRuntimeControl(
  descriptor: RuntimeSessionDescriptor,
  pathname: string,
  body: Record<string, unknown>,
): Promise<ControlResponse> {
  const response = await fetch(`${descriptor.controlUrl}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-meadow-capability": descriptor.capability,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(2_000),
  });
  return { response, body: await readControlResponse(response) };
}

async function runtimeControlIsReady(descriptor: RuntimeSessionDescriptor): Promise<boolean> {
  try {
    const response = await fetch(`${descriptor.controlUrl}/health`, {
      signal: AbortSignal.timeout(750),
    });
    if (!response.ok) return false;
    const body = await readControlResponse(response);
    return body.ready === true
      && body.protocol === descriptor.protocol
      && body.payloadIdentity === descriptor.payload.identity;
  } catch {
    return false;
  }
}

function parseCompatibilityDecision(value: Record<string, unknown>): RuntimeCompatibilityDecision {
  if (value.action === "attach" && value.code === "compatible") {
    return { action: "attach", code: "compatible" };
  }
  if (
    value.action === "handoff"
    && (value.code === "protocol-upgrade"
      || value.code === "payload-upgrade"
      || value.code === "app-upgrade")
  ) {
    return { action: "handoff", code: value.code };
  }
  if (value.action === "refuse" && value.code === "runtime-busy" && typeof value.message === "string") {
    return { action: "refuse", code: "runtime-busy", message: value.message };
  }
  throw new Error("Runtime Supervisor returned an invalid compatibility decision");
}

async function negotiateRuntime(
  descriptor: RuntimeSessionDescriptor,
  payload: RuntimePayloadReference,
): Promise<RuntimeCompatibilityDecision> {
  const result = await postRuntimeControl(descriptor, "/handoff", {
    protocol: MEADOW_RUNTIME_PROTOCOL,
    payload,
  });
  const decision = parseCompatibilityDecision(result.body);
  if (!result.response.ok && decision.action !== "refuse") {
    throw new Error(`Runtime compatibility negotiation failed (${result.response.status})`);
  }
  return decision;
}

async function changeClientLease(
  descriptor: RuntimeSessionDescriptor,
  action: "acquire" | "release",
  leaseId: string,
): Promise<void> {
  const result = await postRuntimeControl(
    descriptor,
    `/lease/client/${action}`,
    { leaseId, ...(action === "acquire" ? { clientPid: process.pid } : {}) },
  );
  if (!result.response.ok || result.body.success !== true) {
    throw new Error(`Runtime client lease ${action} failed (${result.response.status})`);
  }
}

export class RuntimeClientLease {
  private released = false;

  constructor(
    readonly descriptor: RuntimeSessionDescriptor,
    readonly leaseId: string,
  ) {}

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    try {
      await changeClientLease(this.descriptor, "release", this.leaseId);
    } catch {
      // A Runtime that already shut down has implicitly released every lease.
    }
  }
}

export async function createBrowserLaunchUrl(
  descriptor: RuntimeSessionDescriptor,
  targetPath = "/",
): Promise<string> {
  const result = await postRuntimeControl(descriptor, "/browser-session/create", { targetPath });
  if (!result.response.ok || typeof result.body.launchUrl !== "string") {
    throw new Error(`Runtime browser launch failed (${result.response.status})`);
  }
  return result.body.launchUrl;
}

function startSupervisor(options: EnsureRuntimeOptions, launchSpecPath: string): ChildProcess {
  if (!existsSync(options.supervisorEntryPath)) {
    throw new Error(`Runtime Supervisor executable was not found: ${options.supervisorEntryPath}`);
  }
  writeRuntimeSupervisorLaunchSpec(launchSpecPath, options.launchSpec);
  const detached = options.detachedSupervisor ?? true;
  const child = (options.spawnSupervisor ?? spawn)(
    options.nodeExecutable ?? process.execPath,
    [options.supervisorEntryPath, "--launch-spec", launchSpecPath],
    {
      cwd: path.dirname(options.supervisorEntryPath),
      detached,
      env: { ...process.env, ...options.supervisorEnvironment },
      stdio: options.supervisorStdio ?? "ignore",
    },
  );
  child.once("error", () => {});
  if (detached) child.unref();
  return child;
}

function hasLiveOwnershipLock(
  ownershipLockPath: string,
  isProcessAlive: (pid: number) => boolean,
): boolean {
  if (!existsSync(ownershipLockPath)) return false;
  try {
    return isProcessAlive(readHomeOwnershipLock(ownershipLockPath).supervisorPid);
  } catch {
    return false;
  }
}

export async function ensureRuntime(options: EnsureRuntimeOptions): Promise<RuntimeClientLease> {
  const homeDirectory = path.resolve(options.homeDirectory);
  if (path.resolve(options.launchSpec.homeDirectory) !== homeDirectory) {
    throw new Error("Runtime launch spec belongs to a different Meadow Home");
  }
  if (options.launchSpec.payload.identity !== options.payload.identity) {
    throw new Error("Runtime launch spec and client require different payloads");
  }
  const paths = getRuntimePaths(homeDirectory, options.runtimeRoot);
  const descriptorPath = options.descriptorPath ?? paths.sessionDescriptor;
  mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const deadline = Date.now() + (options.startupTimeoutMs ?? 35_000);
  const leaseId = options.clientLeaseId ?? `${process.pid}-${randomUUID()}`;
  let child: ChildProcess | null = null;
  let launchedAt = 0;

  while (Date.now() < deadline) {
    if (existsSync(descriptorPath)) {
      let descriptor: RuntimeSessionDescriptor;
      try {
        descriptor = readRuntimeSessionDescriptor(descriptorPath);
      } catch (error) {
        throw new Error(`Runtime Session Descriptor is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (path.resolve(descriptor.homeDirectory) !== homeDirectory) {
        throw new Error("Runtime Session Descriptor belongs to a different Meadow Home");
      }
      if (await runtimeControlIsReady(descriptor)) {
        const decision = await negotiateRuntime(descriptor, options.payload);
        if (decision.action === "refuse") throw new RuntimeUpgradeRequiredError(decision);
        if (decision.action === "handoff") {
          await delay(100);
          continue;
        }
        await changeClientLease(descriptor, "acquire", leaseId);
        return new RuntimeClientLease(descriptor, leaseId);
      }
      if (!isProcessAlive(descriptor.supervisorPid)) {
        removeStaleRuntimeSessionDescriptor(descriptorPath, isProcessAlive);
      } else {
        await delay(100);
        continue;
      }
    }

    if (!child) {
      const launchSpecPath = path.join(paths.directory, `launch-${process.pid}-${randomUUID()}.json`);
      child = startSupervisor(options, launchSpecPath);
      launchedAt = Date.now();
    } else if (
      child.exitCode !== null
      && Date.now() - launchedAt > 500
      && !hasLiveOwnershipLock(paths.ownershipLock, isProcessAlive)
    ) {
      throw new Error(`Runtime Supervisor exited before advertising a session (exit ${child.exitCode})`);
    }
    await delay(100);
  }
  throw new Error("Runtime Supervisor did not advertise a ready session before the startup timeout");
}
