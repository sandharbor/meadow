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

import { existsSync } from "node:fs";
import path from "node:path";
import type { RuntimeSessionDescriptor } from "../../../../contracts/types/runtime.js";
import {
  ensureRuntime,
  postRuntimeControl,
  RuntimeClientLease,
  waitForRuntimeHomeRelease,
  type EnsureRuntimeOptions,
} from "../../../../runtime/supervisor/src/runtimeClient.js";
import { getRuntimePaths } from "../../../../runtime/supervisor/src/runtimePaths.js";
import { readRuntimeSessionDescriptor } from "../../../../runtime/supervisor/src/sessionDescriptor.js";
import { createSourceRuntimeLaunchSpec } from "../../../../runtime/supervisor/src/sourceLaunchSpec.js";

export interface DevRuntimeManagerOptions {
  projectRoot: string;
  configDirectory: string;
  appVersion: string;
  ensure?: (options: EnsureRuntimeOptions) => Promise<RuntimeClientLease>;
  postControl?: typeof postRuntimeControl;
  waitForRelease?: typeof waitForRuntimeHomeRelease;
  readActiveDescriptor?: (configDirectory: string) => RuntimeSessionDescriptor | null;
  terminateProcess?: (pid: number) => void;
}

function readActiveRuntimeDescriptor(configDirectory: string): RuntimeSessionDescriptor | null {
  const descriptorPath = getRuntimePaths(configDirectory).sessionDescriptor;
  if (!existsSync(descriptorPath)) return null;
  return readRuntimeSessionDescriptor(descriptorPath);
}

/**
 * Dev Tools is an ordinary official Runtime client. It may ask the Runtime
 * Supervisor to start or attach, but it never creates service or Web processes.
 */
export class DevRuntimeManager {
  private readonly projectRoot: string;
  private readonly configDirectory: string;
  private readonly appVersion: string;
  private readonly ensure: (options: EnsureRuntimeOptions) => Promise<RuntimeClientLease>;
  private readonly postControl: typeof postRuntimeControl;
  private readonly waitForRelease: typeof waitForRuntimeHomeRelease;
  private readonly readActiveDescriptor: (configDirectory: string) => RuntimeSessionDescriptor | null;
  private readonly terminateProcess: (pid: number) => void;
  private lease: RuntimeClientLease | null = null;

  constructor(options: DevRuntimeManagerOptions) {
    this.projectRoot = options.projectRoot;
    this.configDirectory = options.configDirectory;
    this.appVersion = options.appVersion;
    this.ensure = options.ensure ?? ensureRuntime;
    this.postControl = options.postControl ?? postRuntimeControl;
    this.waitForRelease = options.waitForRelease ?? waitForRuntimeHomeRelease;
    this.readActiveDescriptor = options.readActiveDescriptor ?? readActiveRuntimeDescriptor;
    this.terminateProcess = options.terminateProcess ?? (pid => { process.kill(pid, "SIGTERM"); });
  }

  get descriptor(): RuntimeSessionDescriptor | null {
    return this.lease?.descriptor ?? null;
  }

  async prepareForLaunch(): Promise<RuntimeSessionDescriptor> {
    if (this.lease) return this.lease.descriptor;
    const perspective = process.env.MEADOW_BUILD_PERSPECTIVE === "composed"
      ? "composed"
      : "standalone";
    const payloadIdentity = process.env.MEADOW_RUNTIME_PAYLOAD_IDENTITY
      ?? `source-${perspective}-${this.appVersion}`;
    const launchSpec = createSourceRuntimeLaunchSpec({
      projectRoot: this.projectRoot,
      homeDirectory: this.configDirectory,
      appVersion: this.appVersion,
      payloadIdentity,
      perspective,
    });
    this.lease = await this.ensure({
      homeDirectory: this.configDirectory,
      payload: launchSpec.payload,
      launchSpec,
      supervisorEntryPath: path.join(
        this.projectRoot,
        "app",
        "runtime",
        "supervisor",
        "dist",
        "meadow-runtime-supervisor.cjs",
      ),
      supervisorStdio: "inherit",
    });
    return this.lease.descriptor;
  }

  async stopRuntime(): Promise<void> {
    const lease = this.lease;
    const descriptor = lease?.descriptor ?? this.readActiveDescriptor(this.configDirectory);
    if (!descriptor) return;

    // Fixture switching is an authoritative development reset. Release Dev
    // Tools' own lease, then ask the Supervisor to stop even when an App, Web
    // session, or operation still holds another lease. Keep our local lease
    // until Home ownership is actually released so a failed request remains
    // retryable instead of letting the next switch mutate a live Home.
    await lease?.release();
    const result = await this.postControl(descriptor, "/shutdown", { force: true });
    if (!result.response.ok) {
      // A Supervisor that predates forced shutdown ignores the flag and
      // returns the old cooperative 409. The descriptor proves which local
      // Supervisor owns this Home, so terminate that exact process and wait
      // for its ownership lock to disappear before replacing the fixture.
      if (result.response.status === 409) {
        this.terminateProcess(descriptor.supervisorPid);
        await this.waitForRelease(descriptor);
        if (this.lease?.descriptor.instanceId === descriptor.instanceId) {
          this.lease = null;
        }
        return;
      }
      throw new Error(
        `The development Runtime could not be stopped before changing the test Home (${result.response.status}).`,
      );
    }
    await this.waitForRelease(descriptor);
    if (this.lease?.descriptor.instanceId === descriptor.instanceId) {
      this.lease = null;
    }
  }
}
