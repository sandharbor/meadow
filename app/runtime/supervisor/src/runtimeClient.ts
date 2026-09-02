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
  type HomeOwnershipLockRecord,
  type RuntimeCompatibilityDecision,
  type RuntimePayloadReference,
  type RuntimeSessionDescriptor,
  type RuntimeSupervisorLaunchSpec,
} from "../../../contracts/types/runtime.js";
import type {
  cooperativeHandoff,
  officialClient,
  ParticipatesIn,
} from "../../../concepts/index.js";
import { readHomeOwnershipLock } from "./homeOwnershipLock.js";
import { writeRuntimeSupervisorLaunchSpec } from "./launchSpec.js";
import { getRuntimePaths } from "./runtimePaths.js";
import {
  readRuntimeSessionDescriptor,
  removeStaleRuntimeSessionDescriptor,
} from "./sessionDescriptor.js";
import {
  logRuntimeOwnership,
  MEADOW_RUNTIME_OWNERSHIP_LOG_PATH_ENV,
  MEADOW_RUNTIME_OWNERSHIP_TRACE_ENV,
  runtimeOwnershipLogPath,
  type RuntimeOwnershipLogContext,
} from "./runtimeOwnershipLog.js";

export class RuntimeUpgradeRequiredError extends Error {
  constructor(
    readonly decision: RuntimeCompatibilityDecision,
    readonly descriptor: RuntimeSessionDescriptor,
    readonly ownershipTraceId: string,
  ) {
    super(decision.action === "refuse"
      ? decision.message
      : "The active Runtime must be upgraded before this client can attach.");
    this.name = "RuntimeUpgradeRequiredError";
  }
}

export class RuntimeOwnershipBlockedError extends Error {
  constructor(
    readonly owner: HomeOwnershipLockRecord,
    readonly ownershipTraceId: string,
  ) {
    super(`Runtime Supervisor ${owner.supervisorPid} still owns the Meadow Home but is not available`);
    this.name = "RuntimeOwnershipBlockedError";
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
  ownership?: {
    traceId?: string;
    clientName: string;
    userAction: string;
    logPath?: string;
  };
}

export interface WaitForRuntimeHomeReleaseOptions {
  runtimeRoot?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  isProcessAlive?: (pid: number) => boolean;
  ownershipTraceId?: string;
  ownershipLogPath?: string;
  source?: string;
  userAction?: string;
}

export interface BrowserLaunchOptions {
  ownershipTraceId?: string;
  source?: string;
  userAction?: string;
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

/**
 * A successful shutdown request is only an acknowledgement. The Supervisor
 * removes its session descriptor before it finishes terminating children and
 * releasing the Home Ownership Lock, so callers that will move or relaunch a
 * Home must wait for the lock itself to become available.
 */
export async function waitForRuntimeHomeRelease(
  descriptor: RuntimeSessionDescriptor,
  options: WaitForRuntimeHomeReleaseOptions = {},
): Promise<void> {
  const ownershipLock = getRuntimePaths(
    descriptor.homeDirectory,
    options.runtimeRoot,
  ).ownershipLock;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pollIntervalMs = options.pollIntervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  const ownershipLog = options.ownershipTraceId ? {
    homeDirectory: descriptor.homeDirectory,
    traceId: options.ownershipTraceId,
    source: options.source ?? "runtime-client",
    instanceId: descriptor.instanceId,
    logPath: options.ownershipLogPath,
  } satisfies RuntimeOwnershipLogContext : null;
  if (ownershipLog) {
    logRuntimeOwnership(ownershipLog, "home-release-wait-started", {
      supervisorPid: descriptor.supervisorPid,
      userAction: options.userAction,
      timeoutMs,
    });
  }

  while (Date.now() < deadline) {
    if (!existsSync(ownershipLock)) {
      if (ownershipLog) logRuntimeOwnership(ownershipLog, "home-ownership-released");
      return;
    }

    try {
      const owner = readHomeOwnershipLock(ownershipLock);
      if (!isProcessAlive(owner.supervisorPid)) {
        if (ownershipLog) {
          logRuntimeOwnership(ownershipLog, "home-owner-process-ended", {
            supervisorPid: owner.supervisorPid,
          });
        }
        return;
      }
      if (owner.instanceId !== descriptor.instanceId) {
        if (ownershipLog) {
          logRuntimeOwnership(ownershipLog, "home-ownership-transferred", {
            nextInstanceId: owner.instanceId,
            nextSupervisorPid: owner.supervisorPid,
          });
        }
        throw new Error(
          `Meadow Home ownership transferred to Runtime Supervisor ${owner.supervisorPid} while waiting for shutdown`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("ownership transferred")) {
        throw error;
      }
      // A lock being rewritten or removed between exists/read calls is a
      // transient shutdown state. Confirm its disappearance on the next poll.
    }

    await delay(pollIntervalMs);
  }

  if (ownershipLog) {
    logRuntimeOwnership(ownershipLog, "home-release-wait-timed-out", {
      supervisorPid: descriptor.supervisorPid,
      timeoutMs,
    });
  }
  throw new Error(
    `Runtime Supervisor ${descriptor.supervisorPid} did not release Meadow Home ownership within ${timeoutMs}ms`,
  );
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
    const leases = value.leases;
    const snapshot = leases && typeof leases === "object" && !Array.isArray(leases)
      ? leases as Record<string, unknown>
      : null;
    if (snapshot && (
      !Number.isInteger(snapshot.clientLeases)
      || !Number.isInteger(snapshot.operationLeases)
      || !Number.isInteger(snapshot.browserSessions)
    )) throw new Error("Runtime compatibility refusal returned invalid blocker counts");
    return {
      action: "refuse",
      code: "runtime-busy",
      message: value.message,
      leases: {
        clientLeases: Number(snapshot?.clientLeases ?? 0),
        operationLeases: Number(snapshot?.operationLeases ?? 0),
        browserSessions: Number(snapshot?.browserSessions ?? 0),
      },
    };
  }
  throw new Error("Runtime Supervisor returned an invalid compatibility decision");
}

async function negotiateRuntime(
  descriptor: RuntimeSessionDescriptor,
  payload: RuntimePayloadReference,
  ownershipTraceId: string,
  clientName: string,
  userAction: string,
): Promise<RuntimeCompatibilityDecision> {
  const result = await postRuntimeControl(descriptor, "/handoff", {
    protocol: MEADOW_RUNTIME_PROTOCOL,
    payload,
    ownershipTraceId,
    clientName,
    userAction,
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
  ownershipTraceId: string,
  clientName: string,
  userAction: string,
): Promise<void> {
  const result = await postRuntimeControl(
    descriptor,
    `/lease/client/${action}`,
    {
      leaseId,
      ownershipTraceId,
      clientName,
      userAction,
      ...(action === "acquire" ? { clientPid: process.pid } : {}),
    },
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
    readonly ownershipTraceId: string = randomUUID(),
    readonly clientName = "Runtime client",
    readonly userAction = "requested Runtime access",
    private readonly ownershipLogPath?: string,
  ) {}

  async release(
    userAction = this.userAction,
  ): Promise<void> {
    if (this.released) return;
    this.released = true;
    const ownershipLog: RuntimeOwnershipLogContext = {
      homeDirectory: this.descriptor.homeDirectory,
      traceId: this.ownershipTraceId,
      source: this.clientName,
      instanceId: this.descriptor.instanceId,
      logPath: this.ownershipLogPath,
    };
    logRuntimeOwnership(ownershipLog, "client-lease-release-requested", {
      userAction,
    });
    try {
      await changeClientLease(
        this.descriptor,
        "release",
        this.leaseId,
        this.ownershipTraceId,
        this.clientName,
        userAction,
      );
      logRuntimeOwnership(ownershipLog, "client-lease-released");
    } catch (error) {
      // A Runtime that already shut down has implicitly released every lease.
      logRuntimeOwnership(ownershipLog, "client-lease-release-observed-runtime-ended", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function createBrowserLaunchUrl(
  descriptor: RuntimeSessionDescriptor,
  targetPath = "/",
  options: BrowserLaunchOptions = {},
): Promise<string> {
  const result = await postRuntimeControl(descriptor, "/browser-session/create", {
    targetPath,
    ownershipTraceId: options.ownershipTraceId,
    clientName: options.source,
    userAction: options.userAction,
  });
  if (!result.response.ok || typeof result.body.launchUrl !== "string") {
    throw new Error(`Runtime browser launch failed (${result.response.status})`);
  }
  return result.body.launchUrl;
}

function startSupervisor(
  options: EnsureRuntimeOptions,
  launchSpecPath: string,
  ownershipTraceId: string,
  ownershipLogPath: string,
): ChildProcess {
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
      env: {
        ...process.env,
        ...options.supervisorEnvironment,
        [MEADOW_RUNTIME_OWNERSHIP_TRACE_ENV]: ownershipTraceId,
        [MEADOW_RUNTIME_OWNERSHIP_LOG_PATH_ENV]: ownershipLogPath,
      },
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
  const ownershipTraceId = options.ownership?.traceId ?? randomUUID();
  const ownershipLogPath = runtimeOwnershipLogPath(options.ownership?.logPath);
  const clientName = options.ownership?.clientName ?? "Runtime client";
  const userAction = options.ownership?.userAction ?? "requested Runtime access";
  const ownershipLog: RuntimeOwnershipLogContext = {
    homeDirectory,
    traceId: ownershipTraceId,
    source: clientName,
    logPath: ownershipLogPath,
  };
  logRuntimeOwnership(ownershipLog, "client-access-requested", {
    clientPid: process.pid,
    userAction,
    requestedPayloadIdentity: options.payload.identity,
    requestedAppVersion: options.payload.appVersion,
    requestedPerspective: options.payload.perspective,
  });
  if (path.resolve(options.launchSpec.homeDirectory) !== homeDirectory) {
    logRuntimeOwnership(ownershipLog, "client-access-rejected", {
      reason: "launch-spec-home-mismatch",
    });
    throw new Error("Runtime launch spec belongs to a different Meadow Home");
  }
  if (options.launchSpec.payload.identity !== options.payload.identity) {
    logRuntimeOwnership(ownershipLog, "client-access-rejected", {
      reason: "launch-spec-payload-mismatch",
    });
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
  let launchAttempts = 0;
  const observedInstances = new Set<string>();

  while (Date.now() < deadline) {
    if (existsSync(descriptorPath)) {
      let descriptor: RuntimeSessionDescriptor;
      try {
        descriptor = readRuntimeSessionDescriptor(descriptorPath);
      } catch (error) {
        logRuntimeOwnership(ownershipLog, "session-descriptor-invalid", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error(`Runtime Session Descriptor is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (path.resolve(descriptor.homeDirectory) !== homeDirectory) {
        logRuntimeOwnership(ownershipLog, "session-descriptor-rejected", {
          reason: "different-home",
          discoveredInstanceId: descriptor.instanceId,
          discoveredSupervisorPid: descriptor.supervisorPid,
        });
        throw new Error("Runtime Session Descriptor belongs to a different Meadow Home");
      }
      if (!observedInstances.has(descriptor.instanceId)) {
        observedInstances.add(descriptor.instanceId);
        logRuntimeOwnership(ownershipLog, "active-runtime-discovered", {
          discoveredInstanceId: descriptor.instanceId,
          discoveredSupervisorPid: descriptor.supervisorPid,
          activePayloadIdentity: descriptor.payload.identity,
          activeAppVersion: descriptor.payload.appVersion,
          activeState: descriptor.state,
        });
      }
      if (await runtimeControlIsReady(descriptor)) {
        const decision = await negotiateRuntime(
          descriptor,
          options.payload,
          ownershipTraceId,
          clientName,
          userAction,
        );
        logRuntimeOwnership(ownershipLog, "compatibility-decided", {
          discoveredInstanceId: descriptor.instanceId,
          action: decision.action,
          code: decision.code,
          clientLeases: decision.action === "refuse" ? decision.leases.clientLeases : undefined,
          browserSessions: decision.action === "refuse" ? decision.leases.browserSessions : undefined,
          operationLeases: decision.action === "refuse" ? decision.leases.operationLeases : undefined,
        });
        if (decision.action === "refuse") {
          logRuntimeOwnership(ownershipLog, "client-access-blocked", {
            discoveredInstanceId: descriptor.instanceId,
            reason: decision.code,
            clientLeases: decision.leases.clientLeases,
            browserSessions: decision.leases.browserSessions,
            operationLeases: decision.leases.operationLeases,
          });
          throw new RuntimeUpgradeRequiredError(
            decision,
            descriptor,
            ownershipTraceId,
          );
        }
        if (decision.action === "handoff") {
          logRuntimeOwnership(ownershipLog, "client-waiting-for-handoff", {
            discoveredInstanceId: descriptor.instanceId,
            reason: decision.code,
          });
          await delay(100);
          continue;
        }
        await changeClientLease(
          descriptor,
          "acquire",
          leaseId,
          ownershipTraceId,
          clientName,
          userAction,
        );
        logRuntimeOwnership(ownershipLog, "client-lease-acquired", {
          discoveredInstanceId: descriptor.instanceId,
          supervisorPid: descriptor.supervisorPid,
          runtimePid: descriptor.runtimePid,
        });
        return new RuntimeClientLease(
          descriptor,
          leaseId,
          ownershipTraceId,
          clientName,
          userAction,
          ownershipLogPath,
        );
      }
      if (!isProcessAlive(descriptor.supervisorPid)) {
        logRuntimeOwnership(ownershipLog, "stale-session-descriptor-removed", {
          discoveredInstanceId: descriptor.instanceId,
          discoveredSupervisorPid: descriptor.supervisorPid,
        });
        removeStaleRuntimeSessionDescriptor(descriptorPath, isProcessAlive);
      } else {
        await delay(100);
        continue;
      }
    }

    if (!child) {
      const launchSpecPath = path.join(paths.directory, `launch-${process.pid}-${randomUUID()}.json`);
      logRuntimeOwnership(ownershipLog, "supervisor-launch-requested", {
        attempt: launchAttempts + 1,
        userAction,
      });
      child = startSupervisor(
        options,
        launchSpecPath,
        ownershipTraceId,
        ownershipLogPath,
      );
      launchedAt = Date.now();
      launchAttempts += 1;
      logRuntimeOwnership(ownershipLog, "supervisor-process-started", {
        attempt: launchAttempts,
        supervisorPid: child.pid,
      });
    } else if (
      child.exitCode !== null
      && Date.now() - launchedAt > 500
      && !hasLiveOwnershipLock(paths.ownershipLock, isProcessAlive)
    ) {
      if (existsSync(paths.startupDiagnostic) || launchAttempts >= 2) {
        logRuntimeOwnership(ownershipLog, "supervisor-startup-failed", {
          attempt: launchAttempts,
          exitCode: child.exitCode,
          startupDiagnosticAvailable: existsSync(paths.startupDiagnostic),
        });
        throw new Error(`Runtime Supervisor exited before advertising a session (exit ${child.exitCode})`);
      }
      // A retiring owner can remove its descriptor shortly before releasing
      // ownership. If our first Supervisor loses that race, make one fresh
      // attempt once the lock is actually gone.
      child = null;
      logRuntimeOwnership(ownershipLog, "supervisor-launch-will-retry", {
        completedAttempts: launchAttempts,
        reason: "retiring-owner-race",
      });
      continue;
    }
    await delay(100);
  }
  if (hasLiveOwnershipLock(paths.ownershipLock, isProcessAlive)) {
    const owner = readHomeOwnershipLock(paths.ownershipLock);
    logRuntimeOwnership(ownershipLog, "client-access-blocked", {
      reason: "live-owner-without-session",
      discoveredInstanceId: owner.instanceId,
      discoveredSupervisorPid: owner.supervisorPid,
    });
    throw new RuntimeOwnershipBlockedError(owner, ownershipTraceId);
  }
  logRuntimeOwnership(ownershipLog, "client-access-timed-out", {
    timeoutMs: options.startupTimeoutMs ?? 35_000,
    launchAttempts,
  });
  throw new Error("Runtime Supervisor did not advertise a ready session before the startup timeout");
}

export type RuntimeClientMeadowConceptParticipations = [
  ParticipatesIn<typeof officialClient, "discover-and-attach", typeof ensureRuntime>,
  ParticipatesIn<typeof cooperativeHandoff, "request", typeof waitForRuntimeHomeRelease>,
];
