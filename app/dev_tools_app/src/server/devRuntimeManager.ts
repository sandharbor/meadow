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

import { execFile } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  getLocalRuntimeStartupDiagnosticPath,
  type LocalRuntimeSession,
} from "../../../shared_code/utils/localRuntimeSession.js";

export const MEADOW_DEV_TMUX_SESSION_ENV = "MEADOW_DEV_TMUX_SESSION";

const execFileAsync = promisify(execFile);

export interface DevRuntimePaneLaunch {
  target: string;
  cwd: string;
  command: string;
}

type RespawnPane = (options: DevRuntimePaneLaunch) => Promise<void>;
type HealthCheck = (url: string) => Promise<boolean>;
type Delay = (milliseconds: number) => Promise<void>;

export interface DevRuntimeManagerOptions {
  tmuxSession: string | null;
  projectRoot: string;
  configDirectory: string;
  appVersion: string;
  runtimeSessionPath: string | null;
  runtimeSession: LocalRuntimeSession | null;
  respawnPane?: RespawnPane;
  healthCheck?: HealthCheck;
  delay?: Delay;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function runtimeCommand(
  environment: Record<string, string>,
  executable: string,
  args: string[],
): string {
  const environmentArgs = Object.entries(environment).map(
    ([name, value]) => `${name}=${value}`,
  );
  return ["exec", "env", ...environmentArgs, executable, ...args]
    .map(shellQuote)
    .join(" ");
}

async function defaultRespawnPane(options: DevRuntimePaneLaunch): Promise<void> {
  await execFileAsync("tmux", [
    "respawn-pane",
    "-k",
    "-t",
    options.target,
    "-c",
    options.cwd,
    options.command,
  ]);
}

async function defaultHealthCheck(url: string): Promise<boolean> {
  try {
    const response = await globalThis.fetch(url, {
      signal: globalThis.AbortSignal.timeout(750),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function defaultDelay(milliseconds: number): Promise<void> {
  await new Promise(resolve => globalThis.setTimeout(resolve, milliseconds));
}

/**
 * Owns the backend/frontend processes for tools/dev. The local runtime
 * descriptor owns connection details; tmux owns process lifetime and logs.
 */
export class DevRuntimeManager {
  private readonly tmuxSession: string | null;
  private readonly projectRoot: string;
  private readonly configDirectory: string;
  private readonly appVersion: string;
  private readonly runtimeSessionPath: string | null;
  private readonly runtimeSession: LocalRuntimeSession | null;
  private readonly respawnPane: RespawnPane;
  private readonly healthCheck: HealthCheck;
  private readonly delay: Delay;

  constructor(options: DevRuntimeManagerOptions) {
    this.tmuxSession = options.tmuxSession;
    this.projectRoot = options.projectRoot;
    this.configDirectory = options.configDirectory;
    this.appVersion = options.appVersion;
    this.runtimeSessionPath = options.runtimeSessionPath;
    this.runtimeSession = options.runtimeSession;
    this.respawnPane = options.respawnPane ?? defaultRespawnPane;
    this.healthCheck = options.healthCheck ?? defaultHealthCheck;
    this.delay = options.delay ?? defaultDelay;
  }

  get isManaged(): boolean {
    return this.tmuxSession !== null;
  }

  /**
   * Give every app/browser kickoff a fresh backend startup against the Home
   * selected by Dev Tools. Vite is Home-independent, so retain it when it is
   * healthy to preserve HMR state and only start it lazily when needed.
   */
  async prepareForLaunch(options: { waitForReady?: boolean } = {}): Promise<void> {
    if (!this.isManaged) return;

    const runtime = this.requireManagedRuntime();
    const runtimeSession = runtime.session;
    const startupDiagnosticPath = getLocalRuntimeStartupDiagnosticPath(
      runtime.sessionPath,
    );
    rmSync(startupDiagnosticPath, { force: true });
    const frontendWasReady = await this.healthCheck(runtimeSession.frontendUrl);

    await Promise.all([
      this.restartBackend(),
      frontendWasReady ? Promise.resolve() : this.startFrontend(),
    ]);

    if (options.waitForReady === false) return;

    await Promise.all([
      this.waitUntilReady(
        `${runtimeSession.backendUrl}/health`,
        "backend",
        startupDiagnosticPath,
      ),
      frontendWasReady
        ? Promise.resolve()
        : this.waitUntilReady(runtimeSession.frontendUrl, "frontend"),
    ]);
  }

  private requireManagedRuntime(): {
    session: LocalRuntimeSession;
    sessionPath: string;
    tmuxSession: string;
  } {
    if (!this.runtimeSession || !this.runtimeSessionPath || !this.tmuxSession) {
      throw new Error("Managed development runtime configuration is incomplete");
    }
    return {
      session: this.runtimeSession,
      sessionPath: this.runtimeSessionPath,
      tmuxSession: this.tmuxSession,
    };
  }

  private async restartBackend(): Promise<void> {
    const runtime = this.requireManagedRuntime();
    await this.respawnPane({
      target: `${runtime.tmuxSession}:backend`,
      cwd: path.join(this.projectRoot, "app", "backend"),
      command: runtimeCommand(
        {
          MEADOW_IS_DEV: "true",
          MEADOW_APP_VERSION: this.appVersion,
          MEADOW_HOME_DIRECTORY_OVERRIDE: this.configDirectory,
          MEADOW_RUNTIME_SESSION_PATH: runtime.sessionPath,
          MEADOW_STARTUP_DIAGNOSTIC_PATH: getLocalRuntimeStartupDiagnosticPath(
            runtime.sessionPath,
          ),
        },
        "npx",
        ["tsx", "src/shared/app-shell/index.ts"],
      ),
    });
  }

  private async startFrontend(): Promise<void> {
    const runtime = this.requireManagedRuntime();
    await this.respawnPane({
      target: `${runtime.tmuxSession}:frontend`,
      cwd: path.join(this.projectRoot, "app", "frontend"),
      command: runtimeCommand(
        {
          MEADOW_RUNTIME_SESSION_PATH: runtime.sessionPath,
        },
        "npx",
        ["vite"],
      ),
    });
  }

  private async waitUntilReady(
    url: string,
    serviceName: string,
    startupDiagnosticPath?: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (startupDiagnosticPath && existsSync(startupDiagnosticPath)) {
        throw new Error(`${serviceName} reported a safe startup failure`);
      }
      if (await this.healthCheck(url)) return;
      await this.delay(500);
    }
    throw new Error(`${serviceName} did not become ready within 30 seconds`);
  }
}
