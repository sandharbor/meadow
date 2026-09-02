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

import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  MEADOW_RUNTIME_PROTOCOL,
  RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION,
  type RuntimeCompatibilityDecision,
  type RuntimeSessionDescriptor,
} from "../../../contracts/types/runtime.js";
import { startRuntimeControlServer } from "../src/controlServer.js";
import { BrowserSessionRegistry } from "../src/browserSessionRegistry.js";
import { RuntimeLeaseRegistry } from "../src/leaseRegistry.js";

const servers: Awaited<ReturnType<typeof startRuntimeControlServer>>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

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
    backendUrl: "http://127.0.0.1:41001/api",
    controlUrl: "http://127.0.0.1:41000",
    frontendUrl: "http://127.0.0.1:41002/",
    frontendOrigin: "http://127.0.0.1:41002",
    capability: "test-capability",
    payload: { identity: "payload-a", appVersion: "0.5.43", perspective: "standalone" },
    state: "ready",
    startedAt: "2026-08-24T00:00:00.000Z",
    lastLeaseAt: "2026-08-24T00:00:00.000Z",
  };
}

async function startControl(
  leases: RuntimeLeaseRegistry,
  onHandoff: (value: RuntimeCompatibilityDecision) => void = () => {},
  onShutdown: () => void = () => {},
) {
  const current = descriptor();
  const server = await startRuntimeControlServer({
    port: 0,
    capability: current.capability,
    descriptor: () => current,
    leases,
    requestHandoff: onHandoff,
    requestShutdown: onShutdown,
    browserSessions: new BrowserSessionRegistry(),
  });
  servers.push(server);
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function startControlWithBrowserSessions(
  leases: RuntimeLeaseRegistry,
  browserSessions: BrowserSessionRegistry,
  onHandoff: (value: RuntimeCompatibilityDecision) => void = () => {},
) {
  const current = descriptor();
  const server = await startRuntimeControlServer({
    port: 0,
    capability: current.capability,
    descriptor: () => current,
    leases,
    requestHandoff: onHandoff,
    requestShutdown: () => {},
    browserSessions,
  });
  servers.push(server);
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function post(url: string, pathname: string, body: unknown, authorized = true): Promise<Response> {
  return fetch(`${url}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorized ? { "x-meadow-capability": "test-capability" } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("Runtime leases and control plane", () => {
  it("tracks idempotent client and operation leases before becoming idle", () => {
    const leases = new RuntimeLeaseRegistry();
    leases.touch(1_000);
    expect(leases.acquire("client", "desktop-a")).toEqual({ clientLeases: 1, operationLeases: 0 });
    expect(leases.acquire("client", "desktop-a")).toEqual({ clientLeases: 1, operationLeases: 0 });
    expect(leases.acquire("operation", "mutation-a")).toEqual({ clientLeases: 1, operationLeases: 1 });
    expect(leases.release("client", "desktop-a")).toEqual({ clientLeases: 0, operationLeases: 1 });
    expect(leases.isIdleFor(Date.now() + 10_000, 1_000)).toBe(false);
    leases.release("operation", "mutation-a");
    expect(leases.isIdleFor(Date.now() + 10_000, 1_000)).toBe(true);
  });

  it("reaps a client lease when its owning process is gone", () => {
    const leases = new RuntimeLeaseRegistry();
    leases.acquire("client", "desktop-a", 101);
    leases.acquire("client", "desktop-b", 202);
    expect(leases.reapDeadClientLeases(pid => pid === 202)).toBe(1);
    expect(leases.snapshot()).toEqual({ clientLeases: 1, operationLeases: 0 });
  });

  it("requires the private capability for lease mutation", async () => {
    const leases = new RuntimeLeaseRegistry();
    const url = await startControl(leases);
    expect((await post(url, "/lease/client/acquire", { leaseId: "cli-a" }, false)).status).toBe(403);
    expect((await post(url, "/lease/client/acquire", { leaseId: "cli-a" })).status).toBe(200);
    expect(leases.snapshot()).toEqual({ clientLeases: 1, operationLeases: 0 });
  });

  it("refuses an incompatible handoff while an operation is leased", async () => {
    const leases = new RuntimeLeaseRegistry();
    leases.acquire("operation", "generate-a");
    const handoffs: RuntimeCompatibilityDecision[] = [];
    const url = await startControl(leases, decision => handoffs.push(decision));
    const response = await post(url, "/handoff", {
      protocol: MEADOW_RUNTIME_PROTOCOL,
      payload: { identity: "payload-b", appVersion: "0.5.43", perspective: "standalone" },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ action: "refuse", code: "runtime-busy" });
    expect(handoffs).toEqual([]);
  });

  it("lets authenticated development tooling force shutdown despite active leases", async () => {
    const leases = new RuntimeLeaseRegistry();
    leases.acquire("client", "desktop-a", 101);
    leases.acquire("operation", "publish-a");
    let shutdowns = 0;
    const url = await startControl(leases, () => {}, () => { shutdowns += 1; });

    const cooperative = await post(url, "/shutdown", {});
    expect(cooperative.status).toBe(409);
    expect(shutdowns).toBe(0);

    const forced = await post(url, "/shutdown", { force: true });
    expect(forced.status).toBe(202);
    expect(await forced.json()).toMatchObject({
      success: true,
      forced: true,
      leases: { clientLeases: 1, operationLeases: 1 },
    });
    expect(shutdowns).toBe(1);
  });

  it("requests cooperative handoff when the owner is idle", async () => {
    const handoffs: RuntimeCompatibilityDecision[] = [];
    const url = await startControl(new RuntimeLeaseRegistry(), decision => handoffs.push(decision));
    const response = await post(url, "/handoff", {
      protocol: MEADOW_RUNTIME_PROTOCOL,
      payload: { identity: "payload-b", appVersion: "0.5.43", perspective: "standalone" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ action: "handoff", code: "payload-upgrade" });
    expect(handoffs).toEqual([{ action: "handoff", code: "payload-upgrade" }]);
  });

  it("exchanges a launch token once and accepts browser heartbeats", async () => {
    const url = await startControl(new RuntimeLeaseRegistry());
    const create = await post(url, "/browser-session/create", { targetPath: "/bundle/example?tab=review" });
    expect(create.status).toBe(200);
    const launchUrl = (await create.json() as { launchUrl: string }).launchUrl;
    const token = new URL(launchUrl).searchParams.get("meadowLaunchToken");
    expect(token).toBeTruthy();

    const exchange = await post(url, "/browser-session/exchange", { token });
    expect(exchange.status).toBe(200);
    const browserSession = await exchange.json() as { sessionId: string; targetPath: string };
    expect(browserSession.targetPath).toBe("/bundle/example?tab=review");
    expect((await post(url, "/browser-session/exchange", { token })).status).toBe(403);
    expect((await post(url, "/browser-session/validate", {
      sessionId: browserSession.sessionId,
    })).status).toBe(200);
    expect(await (await post(url, "/browser-session/heartbeat", {
      sessionId: browserSession.sessionId,
      pageId: "browser-page-a",
    })).json()).toMatchObject({ alive: true, maxAgeSeconds: 75 });
  });

  it("treats browser heartbeats as a client lease until the heartbeat expires", async () => {
    let now = 1_000;
    const sessions = new BrowserSessionRegistry(() => now, 100, 200);
    const handoffs: RuntimeCompatibilityDecision[] = [];
    const url = await startControlWithBrowserSessions(
      new RuntimeLeaseRegistry(),
      sessions,
      decision => handoffs.push(decision),
    );
    const create = await post(url, "/browser-session/create", { targetPath: "/" });
    const token = new URL((await create.json() as { launchUrl: string }).launchUrl)
      .searchParams.get("meadowLaunchToken");
    const exchange = await post(url, "/browser-session/exchange", { token });
    expect(exchange.status).toBe(200);
    const sessionId = (await exchange.json() as { sessionId: string }).sessionId;
    expect((await post(url, "/browser-session/heartbeat", {
      sessionId,
      pageId: "browser-page-a",
    })).status).toBe(200);

    const requirement = {
      protocol: MEADOW_RUNTIME_PROTOCOL,
      payload: { identity: "payload-b", appVersion: "0.5.43", perspective: "standalone" },
    };
    expect((await post(url, "/handoff", requirement)).status).toBe(409);
    now += 150;
    expect((await post(url, "/browser-session/heartbeat", {
      sessionId,
      pageId: "browser-page-a",
    })).status).toBe(200);
    now += 150;
    expect((await post(url, "/handoff", requirement)).status).toBe(409);
    now += 201;
    expect((await post(url, "/handoff", requirement)).status).toBe(200);
    expect(handoffs).toEqual([{ action: "handoff", code: "payload-upgrade" }]);
  });

  it("shortens a closing browser page lease while another page may keep the session alive", async () => {
    let now = 1_000;
    const sessions = new BrowserSessionRegistry(() => now, 100, 200, 20);
    const handoffs: RuntimeCompatibilityDecision[] = [];
    const url = await startControlWithBrowserSessions(
      new RuntimeLeaseRegistry(),
      sessions,
      decision => handoffs.push(decision),
    );
    const create = await post(url, "/browser-session/create", { targetPath: "/" });
    const token = new URL((await create.json() as { launchUrl: string }).launchUrl)
      .searchParams.get("meadowLaunchToken");
    const exchange = await post(url, "/browser-session/exchange", { token });
    const sessionId = (await exchange.json() as { sessionId: string }).sessionId;
    await post(url, "/browser-session/heartbeat", { sessionId, pageId: "browser-page-a" });
    await post(url, "/browser-session/heartbeat", { sessionId, pageId: "browser-page-b" });

    const requirement = {
      protocol: MEADOW_RUNTIME_PROTOCOL,
      payload: { identity: "payload-b", appVersion: "0.5.43", perspective: "standalone" },
    };
    expect((await post(url, "/browser-session/closing", {
      sessionId,
      pageId: "browser-page-a",
    })).status).toBe(200);
    now += 21;
    expect((await post(url, "/handoff", requirement)).status).toBe(409);

    expect((await post(url, "/browser-session/closing", {
      sessionId,
      pageId: "browser-page-b",
    })).status).toBe(200);
    now += 21;
    expect((await post(url, "/handoff", requirement)).status).toBe(200);
    expect(handoffs).toEqual([{ action: "handoff", code: "payload-upgrade" }]);
  });
});
