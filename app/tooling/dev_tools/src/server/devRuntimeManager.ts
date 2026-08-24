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

import path from "node:path";
import type { RuntimeSessionDescriptor } from "../../../../contracts/types/runtime.js";
import {
  ensureRuntime,
  postRuntimeControl,
  RuntimeClientLease,
  type EnsureRuntimeOptions,
} from "../../../../runtime/supervisor/src/runtimeClient.js";
import { createSourceRuntimeLaunchSpec } from "../../../../runtime/supervisor/src/sourceLaunchSpec.js";

export interface DevRuntimeManagerOptions {
  projectRoot: string;
  configDirectory: string;
  appVersion: string;
  ensure?: (options: EnsureRuntimeOptions) => Promise<RuntimeClientLease>;
  postControl?: typeof postRuntimeControl;
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
  private lease: RuntimeClientLease | null = null;

  constructor(options: DevRuntimeManagerOptions) {
    this.projectRoot = options.projectRoot;
    this.configDirectory = options.configDirectory;
    this.appVersion = options.appVersion;
    this.ensure = options.ensure ?? ensureRuntime;
    this.postControl = options.postControl ?? postRuntimeControl;
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
    if (!lease) return;
    this.lease = null;
    await lease.release();
    const result = await this.postControl(lease.descriptor, "/shutdown", {});
    if (!result.response.ok) {
      throw new Error(
        "The Runtime is still in use. Close Meadow Desktop and wait for active operations before changing the test Home.",
      );
    }
  }
}
