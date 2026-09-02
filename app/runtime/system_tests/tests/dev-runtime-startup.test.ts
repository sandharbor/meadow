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

function runtimeLease(release = vi.fn(() => Promise.resolve())): RuntimeClientLease {
  return {
    descriptor: descriptor(),
    leaseId: "dev-tools-a",
    ownershipTraceId: "trace-a",
    release,
  } as unknown as RuntimeClientLease;
}

describe("development Runtime startup", () => {
  it("asks only the Runtime Supervisor to start the service and Web children", async () => {
    const calls: EnsureRuntimeOptions[] = [];
    const release = vi.fn(() => Promise.resolve());
    const manager = new DevRuntimeManager({
      projectRoot: "/tmp/meadow",
      configDirectory: "/tmp/Meadow Home",
      appVersion: "0.5.43",
      ensure: options => {
        calls.push(options);
        return Promise.resolve(runtimeLease(release));
      },
    });

    expect(await manager.prepareForLaunch("clicked Start Dev App")).toEqual({
      descriptor: descriptor(),
      ownershipTraceId: "trace-a",
    });
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
    expect(calls[0].ownership).toEqual({
      clientName: "Meadow Dev Tools",
      userAction: "clicked Start Dev App",
    });
    expect(release).toHaveBeenCalledWith("finished the Dev Tools launch handoff");
  });

  it("uses only transient bootstrap leases across App and Web launches", async () => {
    const releases = [
      vi.fn(() => Promise.resolve()),
      vi.fn(() => Promise.resolve()),
    ];
    let call = 0;
    const ensure = vi.fn(() => Promise.resolve(runtimeLease(releases[call++])));
    const manager = new DevRuntimeManager({
      projectRoot: "/tmp/meadow",
      configDirectory: "/tmp/Meadow Home",
      appVersion: "0.5.43",
      ensure,
    });

    await manager.prepareForLaunch("clicked Start Dev App");
    await manager.prepareForLaunch("clicked Open Browser");
    expect(ensure).toHaveBeenCalledTimes(2);
    expect(releases[0]).toHaveBeenCalledOnce();
    expect(releases[1]).toHaveBeenCalledOnce();
  });

  it("forces shutdown before changing a fixture without holding its own lease", async () => {
    const postControl = vi.fn(() => Promise.resolve({
      response: new Response(null, { status: 202 }),
      body: { success: true },
    }));
    const waitForRelease = vi.fn(() => Promise.resolve());
    const manager = new DevRuntimeManager({
      projectRoot: "/tmp/meadow",
      configDirectory: "/tmp/Meadow Home",
      appVersion: "0.5.43",
      postControl,
      waitForRelease,
      readActiveDescriptor: () => descriptor(),
    });

    await manager.stopRuntime();
    expect(postControl).toHaveBeenCalledWith(descriptor(), "/shutdown", { force: true });
    expect(waitForRelease).toHaveBeenCalledWith(descriptor());
  });

  it("discovers and force-stops a Runtime left alive across a Dev Tools restart", async () => {
    const postControl = vi.fn(() => Promise.resolve({
      response: new Response(null, { status: 202 }),
      body: { success: true },
    }));
    const waitForRelease = vi.fn(() => Promise.resolve());
    const manager = new DevRuntimeManager({
      projectRoot: "/tmp/meadow",
      configDirectory: "/tmp/Meadow Home",
      appVersion: "0.5.43",
      postControl,
      waitForRelease,
      readActiveDescriptor: () => descriptor(),
    });

    await manager.stopRuntime();
    expect(postControl).toHaveBeenCalledWith(descriptor(), "/shutdown", { force: true });
    expect(waitForRelease).toHaveBeenCalledWith(descriptor());
  });

  it("terminates a pre-force Supervisor after its authenticated shutdown refusal", async () => {
    const postControl = vi.fn(() => Promise.resolve({
      response: new Response(null, { status: 409 }),
      body: { error: "The Runtime is busy and cannot shut down cooperatively" },
    }));
    const waitForRelease = vi.fn(() => Promise.resolve());
    const terminateProcess = vi.fn();
    const manager = new DevRuntimeManager({
      projectRoot: "/tmp/meadow",
      configDirectory: "/tmp/Meadow Home",
      appVersion: "0.5.43",
      postControl,
      waitForRelease,
      terminateProcess,
      readActiveDescriptor: () => descriptor(),
    });

    await manager.stopRuntime();

    expect(terminateProcess).toHaveBeenCalledWith(descriptor().supervisorPid);
    expect(waitForRelease).toHaveBeenCalledWith(descriptor());
  });

  it("does not forget a Runtime when a forced shutdown request fails", async () => {
    const postControl = vi.fn()
      .mockResolvedValueOnce({
        response: new Response(null, { status: 503 }),
        body: { error: "not ready" },
      })
      .mockResolvedValueOnce({
        response: new Response(null, { status: 202 }),
        body: { success: true },
      });
    const waitForRelease = vi.fn(() => Promise.resolve());
    const manager = new DevRuntimeManager({
      projectRoot: "/tmp/meadow",
      configDirectory: "/tmp/Meadow Home",
      appVersion: "0.5.43",
      postControl,
      waitForRelease,
      terminateProcess: vi.fn(),
      readActiveDescriptor: () => descriptor(),
    });

    await expect(manager.stopRuntime()).rejects.toThrow("could not be stopped");
    await manager.stopRuntime();

    expect(postControl).toHaveBeenCalledTimes(2);
    expect(postControl).toHaveBeenNthCalledWith(2, descriptor(), "/shutdown", { force: true });
    expect(waitForRelease).toHaveBeenCalledOnce();
  });
});
