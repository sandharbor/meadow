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

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimePayloadReference, RuntimeSupervisorLaunchSpec } from "../../../contracts/types/runtime.js";
import {
  ensureRuntime,
  postRuntimeControl,
  RuntimeClientLease,
  RuntimeUpgradeRequiredError,
  waitForRuntimeHomeRelease,
} from "../src/runtimeClient.js";
import { getRuntimePaths } from "../src/runtimePaths.js";

const homes: string[] = [];
const leases: RuntimeClientLease[] = [];
const supervisorEntryPath = path.resolve(import.meta.dirname, "../src/supervisorCli.ts");
const tsxExecutable = path.resolve(import.meta.dirname, "../../service/node_modules/.bin/tsx");
const healthServer = "require('http').createServer((_q,s)=>{s.writeHead(200);s.end('ready')}).listen(Number(process.env.MEADOW_BACKEND_PORT||process.env.PORT),'127.0.0.1')";

function makeHome(): string {
  const home = mkdtempSync(path.join(tmpdir(), "meadow-supervisor-lifecycle-"));
  homes.push(home);
  return home;
}

function payload(identity: string): RuntimePayloadReference {
  return { identity, appVersion: "0.5.43", perspective: "standalone" };
}

function launchSpec(homeDirectory: string, runtimePayload: RuntimePayloadReference): RuntimeSupervisorLaunchSpec {
  return {
    schemaVersion: 1,
    homeDirectory,
    payload: runtimePayload,
    service: {
      executable: process.execPath,
      args: ["-e", healthServer],
      cwd: homeDirectory,
    },
    web: {
      executable: process.execPath,
      args: ["-e", healthServer],
      cwd: homeDirectory,
    },
    idleTimeoutMs: 1_000,
  };
}

async function attach(homeDirectory: string, identity: string, leaseId: string): Promise<RuntimeClientLease> {
  const runtimePayload = payload(identity);
  const lease = await ensureRuntime({
    homeDirectory,
    payload: runtimePayload,
    launchSpec: launchSpec(homeDirectory, runtimePayload),
    supervisorEntryPath,
    nodeExecutable: tsxExecutable,
    clientLeaseId: leaseId,
    startupTimeoutMs: 10_000,
  });
  leases.push(lease);
  return lease;
}

async function waitUntil(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Runtime lifecycle state");
}

afterEach(async () => {
  await Promise.all(leases.splice(0).map(lease => lease.release()));
  for (const home of homes.splice(0)) {
    const paths = getRuntimePaths(home);
    await waitUntil(() => !existsSync(paths.sessionDescriptor)).catch(() => {});
    rmSync(paths.directory, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

describe("Runtime Supervisor lifecycle", () => {
  it("converges simultaneous clients on one Home owner and Runtime process", async () => {
    const home = makeHome();
    const [desktop, cli] = await Promise.all([
      attach(home, "payload-a", "desktop-a"),
      attach(home, "payload-a", "cli-a"),
    ]);

    expect(cli.descriptor.instanceId).toBe(desktop.descriptor.instanceId);
    expect(cli.descriptor.runtimePid).toBe(desktop.descriptor.runtimePid);
    expect(existsSync(getRuntimePaths(home).ownershipLock)).toBe(true);

    await desktop.release();
    await cli.release();
    await waitUntil(() => !existsSync(getRuntimePaths(home).sessionDescriptor), 5_000);
  }, 20_000);

  it("refuses an incompatible payload while an official client is connected", async () => {
    const home = makeHome();
    await attach(home, "payload-a", "desktop-a");

    await expect(attach(home, "payload-b", "cli-b")).rejects.toBeInstanceOf(
      RuntimeUpgradeRequiredError,
    );
  }, 20_000);

  it("hands an idle Home cooperatively to a different payload", async () => {
    const home = makeHome();
    const first = await attach(home, "payload-a", "desktop-a");
    const firstInstanceId = first.descriptor.instanceId;
    await first.release();

    const replacement = await attach(home, "payload-b", "desktop-b");
    expect(replacement.descriptor.instanceId).not.toBe(firstInstanceId);
    expect(replacement.descriptor.payload.identity).toBe("payload-b");
  }, 20_000);

  it("waits for cooperative shutdown to release Home ownership before relaunch", async () => {
    const home = makeHome();
    const first = await attach(home, "payload-a", "desktop-a");
    const firstDescriptor = first.descriptor;
    await first.release();

    const shutdown = await postRuntimeControl(firstDescriptor, "/shutdown", {});
    expect(shutdown.response.status).toBe(202);
    await waitForRuntimeHomeRelease(firstDescriptor);
    expect(existsSync(getRuntimePaths(home).ownershipLock)).toBe(false);

    const replacement = await attach(home, "payload-b", "desktop-b");
    expect(replacement.descriptor.instanceId).not.toBe(firstDescriptor.instanceId);
  }, 20_000);
});
