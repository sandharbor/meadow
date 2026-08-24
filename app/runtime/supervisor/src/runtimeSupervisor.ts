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
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import {
  MEADOW_RUNTIME_PROTOCOL,
  RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION,
  type RuntimeCompatibilityDecision,
  type RuntimeSessionDescriptor,
  type RuntimeSupervisorLaunchSpec,
} from "../../../contracts/types/runtime.js";
import { startRuntimeControlServer } from "./controlServer.js";
import { BrowserSessionRegistry } from "./browserSessionRegistry.js";
import { allocateDistinctRuntimePorts, type RuntimePorts } from "./freePort.js";
import { acquireHomeOwnership, type HomeOwnershipLease } from "./homeOwnershipLock.js";
import { RuntimeLeaseRegistry } from "./leaseRegistry.js";
import { getRuntimePaths } from "./runtimePaths.js";
import {
  removeRuntimeSessionDescriptor,
  writeRuntimeSessionDescriptor,
} from "./sessionDescriptor.js";

type SupervisorExitReason = "idle" | "handoff" | "requested" | "signal" | "child-exit" | "startup-failure";

export interface RuntimeSupervisorOptions {
  runtimeRoot?: string;
  now?: () => number;
  spawnChild?: typeof spawn;
  healthCheck?: (url: string) => Promise<boolean>;
  onExit?: (reason: SupervisorExitReason) => void;
  childStdio?: (kind: "service" | "web") => StdioOptions;
  ports?: RuntimePorts | (() => Promise<RuntimePorts>);
  capability?: string;
}

function defaultHealthCheck(url: string): Promise<boolean> {
  return fetch(url, { signal: AbortSignal.timeout(750) })
    .then(response => response.ok)
    .catch(() => false);
}

async function closeServer(server: Server | null): Promise<void> {
  if (!server) return;
  await new Promise<void>(resolve => server.close(() => resolve()));
}

export class RuntimeSupervisor {
  readonly leases = new RuntimeLeaseRegistry();
  readonly browserSessions = new BrowserSessionRegistry();
  private readonly instanceId = randomUUID();
  private readonly capability: string;
  private readonly now: () => number;
  private readonly spawnChild: typeof spawn;
  private readonly healthCheck: (url: string) => Promise<boolean>;
  private readonly onExit: (reason: SupervisorExitReason) => void;
  private descriptor: RuntimeSessionDescriptor | null = null;
  private ownership: HomeOwnershipLease | null = null;
  private serviceProcess: ChildProcess | null = null;
  private webProcess: ChildProcess | null = null;
  private controlServer: Server | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private shutdownStarted = false;

  constructor(
    readonly launchSpec: RuntimeSupervisorLaunchSpec,
    private readonly options: RuntimeSupervisorOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.capability = options.capability ?? randomBytes(32).toString("base64url");
    this.spawnChild = options.spawnChild ?? spawn;
    this.healthCheck = options.healthCheck ?? defaultHealthCheck;
    this.onExit = options.onExit ?? (() => {});
  }

  async start(): Promise<RuntimeSessionDescriptor> {
    const paths = getRuntimePaths(this.launchSpec.homeDirectory, this.options.runtimeRoot);
    this.ownership = acquireHomeOwnership({
      homeDirectory: this.launchSpec.homeDirectory,
      instanceId: this.instanceId,
      supervisorPid: process.pid,
      payloadIdentity: this.launchSpec.payload.identity,
      runtimeRoot: this.options.runtimeRoot,
    });

    try {
      rmSync(paths.startupDiagnostic, { force: true });
      const ports = typeof this.options.ports === "function"
        ? await this.options.ports()
        : this.options.ports ?? await allocateDistinctRuntimePorts();
      const frontendOrigin = `http://127.0.0.1:${ports.frontendPort}`;
      const startedAt = new Date(this.now()).toISOString();
      this.descriptor = {
        schemaVersion: RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION,
        protocol: MEADOW_RUNTIME_PROTOCOL,
        homeDirectory: this.launchSpec.homeDirectory,
        instanceId: this.instanceId,
        supervisorPid: process.pid,
        runtimePid: process.pid,
        controlPort: ports.controlPort,
        backendPort: ports.backendPort,
        frontendPort: ports.frontendPort,
        controlUrl: `http://127.0.0.1:${ports.controlPort}`,
        backendUrl: `http://127.0.0.1:${ports.backendPort}/api`,
        frontendUrl: `${frontendOrigin}/`,
        frontendOrigin,
        capability: this.capability,
        payload: this.launchSpec.payload,
        state: "starting",
        startedAt,
        lastLeaseAt: startedAt,
      };

      this.controlServer = await startRuntimeControlServer({
        port: ports.controlPort,
        capability: this.capability,
        descriptor: () => this.requireDescriptor(),
        leases: this.leases,
        requestHandoff: decision => this.handleHandoff(decision),
        requestShutdown: () => void this.shutdown("requested"),
        browserSessions: this.browserSessions,
      });

      this.serviceProcess = this.startChild("service", this.launchSpec.service, {
        MEADOW_HOME_DIRECTORY_OVERRIDE: this.launchSpec.homeDirectory,
        MEADOW_APP_VERSION: this.launchSpec.payload.appVersion,
        MEADOW_BACKEND_PORT: String(ports.backendPort),
        MEADOW_API_CAPABILITY: this.capability,
        MEADOW_UI_ORIGIN: frontendOrigin,
        MEADOW_STARTUP_DIAGNOSTIC_PATH: paths.startupDiagnostic,
        MEADOW_RUNTIME_CONTROL_URL: this.descriptor.controlUrl,
        MEADOW_RUNTIME_SUPERVISOR_PID: String(process.pid),
      });
      if (!this.serviceProcess.pid) throw new Error("Runtime service did not report a process ID");
      this.descriptor.runtimePid = this.serviceProcess.pid;
      this.ownership.updateRuntimePid(this.serviceProcess.pid);

      this.webProcess = this.startChild("web", this.launchSpec.web, {
        PORT: String(ports.frontendPort),
        VITE_FRONTEND_PORT: String(ports.frontendPort),
        VITE_BACKEND_PORT: String(ports.backendPort),
        MEADOW_API_CAPABILITY: this.capability,
        MEADOW_RUNTIME_CONTROL_URL: this.descriptor.controlUrl,
      });

      await Promise.all([
        this.waitUntilHealthy(`${this.descriptor.backendUrl}/health`, paths.startupDiagnostic),
        this.waitUntilHealthy(this.descriptor.frontendUrl),
      ]);
      this.descriptor.state = "ready";
      this.descriptor.lastLeaseAt = new Date(this.now()).toISOString();
      writeRuntimeSessionDescriptor(this.descriptor, paths.sessionDescriptor);
      this.leases.touch(this.now());
      this.idleTimer = setInterval(() => {
        this.leases.reapDeadClientLeases(pid => {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        });
        if (
          this.browserSessions.activeSessionCount() === 0
          && this.leases.isIdleFor(this.now(), this.launchSpec.idleTimeoutMs)
        ) {
          void this.shutdown("idle");
        }
      }, Math.min(1_000, Math.max(100, Math.floor(this.launchSpec.idleTimeoutMs / 4))));
      this.idleTimer.unref();
      return this.descriptor;
    } catch (error) {
      await this.shutdown("startup-failure");
      throw error;
    }
  }

  async shutdown(reason: SupervisorExitReason): Promise<void> {
    if (this.shutdownStarted) return;
    this.shutdownStarted = true;
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
    const paths = getRuntimePaths(this.launchSpec.homeDirectory, this.options.runtimeRoot);
    removeRuntimeSessionDescriptor(paths.sessionDescriptor, this.instanceId);
    this.terminateChild(this.webProcess);
    this.terminateChild(this.serviceProcess);
    this.webProcess = null;
    this.serviceProcess = null;
    await closeServer(this.controlServer);
    this.controlServer = null;
    this.ownership?.release();
    this.ownership = null;
    this.onExit(reason);
  }

  private startChild(
    kind: "service" | "web",
    command: RuntimeSupervisorLaunchSpec["service"],
    supervisorEnvironment: Record<string, string>,
  ): ChildProcess {
    const child = this.spawnChild(command.executable, command.args, {
      cwd: command.cwd,
      env: {
        ...process.env,
        ...command.environment,
        ...supervisorEnvironment,
      },
      stdio: this.options.childStdio?.(kind) ?? "inherit",
    });
    child.once("exit", () => {
      if (!this.shutdownStarted) void this.shutdown("child-exit");
    });
    return child;
  }

  private terminateChild(child: ChildProcess | null): void {
    if (child && child.exitCode === null && !child.killed) child.kill("SIGTERM");
  }

  private async waitUntilHealthy(url: string, diagnosticPath?: string): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (diagnosticPath && existsSync(diagnosticPath)) {
        throw new Error("Runtime service reported a safe startup failure");
      }
      if (await this.healthCheck(url)) return;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`Runtime child did not become healthy: ${url}`);
  }

  private handleHandoff(decision: RuntimeCompatibilityDecision): void {
    if (decision.action !== "handoff") return;
    const descriptor = this.requireDescriptor();
    descriptor.state = "handoff-requested";
    writeRuntimeSessionDescriptor(
      descriptor,
      getRuntimePaths(this.launchSpec.homeDirectory, this.options.runtimeRoot).sessionDescriptor,
    );
    setImmediate(() => void this.shutdown("handoff"));
  }

  private requireDescriptor(): RuntimeSessionDescriptor {
    if (!this.descriptor) throw new Error("Runtime Supervisor descriptor is unavailable");
    return this.descriptor;
  }
}
