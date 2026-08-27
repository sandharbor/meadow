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

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type {
  RuntimeAttachRequirement,
  RuntimeCompatibilityDecision,
  RuntimeSessionDescriptor,
} from "../../../contracts/types/runtime.js";
import { decideRuntimeCompatibility } from "./compatibility.js";
import { BrowserSessionRegistry } from "./browserSessionRegistry.js";
import { RuntimeLeaseRegistry, type RuntimeLeaseKind } from "./leaseRegistry.js";

interface ControlServerOptions {
  port: number;
  capability: string;
  descriptor: () => RuntimeSessionDescriptor;
  leases: RuntimeLeaseRegistry;
  requestHandoff: (decision: RuntimeCompatibilityDecision) => void;
  requestShutdown: () => void;
  browserSessions: BrowserSessionRegistry;
}

function leaseSnapshot(options: ControlServerOptions) {
  const leases = options.leases.snapshot();
  return {
    ...leases,
    clientLeases: leases.clientLeases + options.browserSessions.activeSessionCount(),
  };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 64 * 1024) throw new Error("Runtime control request is too large");
    chunks.push(buffer);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Runtime control request must be an object");
  }
  return value as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function leaseRoute(pathname: string): { kind: RuntimeLeaseKind; action: "acquire" | "release" } | null {
  const match = /^\/lease\/(client|operation)\/(acquire|release)$/.exec(pathname);
  return match ? {
    kind: match[1] as RuntimeLeaseKind,
    action: match[2] as "acquire" | "release",
  } : null;
}

function parseAttachRequirement(value: Record<string, unknown>): RuntimeAttachRequirement {
  const payload = value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Runtime handoff requires payload identity");
  }
  const candidate = payload as Record<string, unknown>;
  if (
    typeof value.protocol !== "string"
    || typeof candidate.identity !== "string"
    || typeof candidate.appVersion !== "string"
    || (candidate.perspective !== "standalone" && candidate.perspective !== "composed")
  ) {
    throw new Error("Invalid Runtime handoff requirement");
  }
  return {
    protocol: value.protocol,
    payload: {
      identity: candidate.identity,
      appVersion: candidate.appVersion,
      perspective: candidate.perspective,
    },
  };
}

export async function startRuntimeControlServer(options: ControlServerOptions): Promise<Server> {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${options.port}`);
      if (request.method === "GET" && requestUrl.pathname === "/health") {
        const descriptor = options.descriptor();
        sendJson(response, 200, {
          ready: descriptor.state === "ready",
          protocol: descriptor.protocol,
          payloadIdentity: descriptor.payload.identity,
          leases: leaseSnapshot(options),
        });
        return;
      }
      if (request.headers["x-meadow-capability"] !== options.capability) {
        sendJson(response, 403, { error: "Runtime control capability is required" });
        return;
      }
      const route = leaseRoute(requestUrl.pathname);
      if (request.method === "POST" && route) {
        const body = await readJson(request);
        if (typeof body.leaseId !== "string") throw new Error("leaseId is required");
        const clientPid = route.kind === "client" && route.action === "acquire"
          ? body.clientPid
          : undefined;
        if (clientPid !== undefined && !Number.isInteger(clientPid)) {
          throw new Error("clientPid must be an integer");
        }
        const leases = options.leases[route.action](
          route.kind,
          body.leaseId,
          clientPid === undefined ? undefined : Number(clientPid),
        );
        sendJson(response, 200, { success: true, leases });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/handoff") {
        const requirement = parseAttachRequirement(await readJson(request));
        const decision = decideRuntimeCompatibility(
          options.descriptor(),
          requirement,
          leaseSnapshot(options),
        );
        sendJson(response, decision.action === "refuse" ? 409 : 200, decision);
        if (decision.action === "handoff") options.requestHandoff(decision);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/browser-session/create") {
        const body = await readJson(request);
        const targetPath = typeof body.targetPath === "string" ? body.targetPath : "/";
        const launch = options.browserSessions.createLaunchToken(targetPath);
        const url = new URL(launch.targetPath, options.descriptor().frontendOrigin);
        url.searchParams.set("meadowLaunchToken", launch.token);
        sendJson(response, 200, { launchUrl: url.toString() });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/browser-session/exchange") {
        const body = await readJson(request);
        if (typeof body.token !== "string") throw new Error("Browser launch token is required");
        const session = options.browserSessions.exchangeLaunchToken(body.token);
        if (!session) {
          sendJson(response, 403, { error: "Browser launch token is invalid or expired" });
          return;
        }
        sendJson(response, 200, session);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/browser-session/validate") {
        const body = await readJson(request);
        const valid = typeof body.sessionId === "string"
          && options.browserSessions.validateSession(body.sessionId);
        sendJson(response, valid ? 200 : 401, { valid });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/shutdown") {
        const body = await readJson(request);
        if (body.force !== undefined && typeof body.force !== "boolean") {
          throw new Error("force must be a boolean");
        }
        const force = body.force === true;
        const leases = leaseSnapshot(options);
        if (!force && (leases.clientLeases > 0 || leases.operationLeases > 0)) {
          sendJson(response, 409, {
            error: "The Runtime is busy and cannot shut down cooperatively",
            leases,
          });
          return;
        }
        sendJson(response, 202, { success: true, forced: force, leases });
        options.requestShutdown();
        return;
      }
      sendJson(response, 404, { error: "Unknown Runtime control route" });
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Invalid Runtime control request",
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", resolve);
  });
  return server;
}
