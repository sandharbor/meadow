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

import { describe, expect, it, vi } from "vitest";
import {
  MEADOW_RUNTIME_PROTOCOL,
  RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION,
  type RuntimeSessionDescriptor,
} from "../../../contracts/types/runtime.js";
import {
  RuntimeClientLease,
  type EnsureRuntimeOptions,
} from "../../../runtime/supervisor/src/runtimeClient.js";
import { DevRuntimeManager } from "../../../tooling/dev_tools/src/server/devRuntimeManager.js";

function descriptor(): RuntimeSessionDescriptor {
  return {
    schemaVersion: RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION,
    protocol: MEADOW_RUNTIME_PROTOCOL,
    homeDirectory: "/tmp/Meadow Home",
    instanceId: "runtime-a",
    supervisorPid: 101,
    runtimePid: 102,
    controlPort: 41000,
    backendPort: 41001,
    frontendPort: 41002,
    controlUrl: "http://127.0.0.1:41000",
    backendUrl: "http://127.0.0.1:41001/api",
    frontendUrl: "http://127.0.0.1:41002/",
    frontendOrigin: "http://127.0.0.1:41002",
    capability: "test-capability",
    payload: { identity: "source-standalone-0.5.43", appVersion: "0.5.43", perspective: "standalone" },
    state: "ready",
    startedAt: "2026-08-24T00:00:00.000Z",
    lastLeaseAt: "2026-08-24T00:00:00.000Z",
  };
}

describe("development Runtime startup", () => {
  it("asks only the Runtime Supervisor to start the service and Web children", async () => {
    const calls: EnsureRuntimeOptions[] = [];
    const manager = new DevRuntimeManager({
      projectRoot: "/tmp/meadow",
      configDirectory: "/tmp/Meadow Home",
      appVersion: "0.5.43",
      ensure: options => {
        calls.push(options);
        return Promise.resolve(new RuntimeClientLease(descriptor(), "dev-tools-a"));
      },
    });

    expect(await manager.prepareForLaunch()).toEqual(descriptor());
    expect(calls).toHaveLength(1);
    expect(calls[0].supervisorEntryPath).toBe(
      "/tmp/meadow/app/runtime/supervisor/dist/meadow-runtime-supervisor.cjs",
    );
    expect(calls[0].launchSpec.service).toMatchObject({
      cwd: "/tmp/meadow/app/runtime/service",
      args: ["src/shared/app-shell/index.ts"],
    });
    expect(calls[0].launchSpec.web).toMatchObject({
      cwd: "/tmp/meadow/app/clients/web",
      args: [],
    });
  });

  it("retains one official client lease across App and Web launches", async () => {
    const ensure = vi.fn(() => Promise.resolve(new RuntimeClientLease(descriptor(), "dev-tools-a")));
    const manager = new DevRuntimeManager({
      projectRoot: "/tmp/meadow",
      configDirectory: "/tmp/Meadow Home",
      appVersion: "0.5.43",
      ensure,
    });

    await manager.prepareForLaunch();
    await manager.prepareForLaunch();
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it("releases its lease before cooperatively shutting down for a fixture change", async () => {
    const release = vi.fn(() => Promise.resolve());
    const postControl = vi.fn(() => Promise.resolve({
      response: new Response(null, { status: 202 }),
      body: { success: true },
    }));
    const manager = new DevRuntimeManager({
      projectRoot: "/tmp/meadow",
      configDirectory: "/tmp/Meadow Home",
      appVersion: "0.5.43",
      ensure: () => Promise.resolve({ descriptor: descriptor(), leaseId: "dev-tools-a", release } as unknown as RuntimeClientLease),
      postControl,
    });

    await manager.prepareForLaunch();
    await manager.stopRuntime();
    expect(release).toHaveBeenCalledOnce();
    expect(postControl).toHaveBeenCalledWith(descriptor(), "/shutdown", {});
  });
});
