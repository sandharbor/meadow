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
  ownershipEvent?: (
    event: string,
    details?: Record<string, string | number | boolean | null | undefined>,
  ) => void;
}

function ownershipRequestDetails(body: Record<string, unknown>) {
  return {
    requestTraceId: typeof body.ownershipTraceId === "string"
      ? body.ownershipTraceId
      : undefined,
    clientName: typeof body.clientName === "string" ? body.clientName : undefined,
    userAction: typeof body.userAction === "string" ? body.userAction : undefined,
  };
}

function leaseSnapshot(options: ControlServerOptions) {
  const leases = options.leases.snapshot();
  const browserSessions = options.browserSessions.activeSessionCount();
  return {
    ...leases,
    clientLeases: leases.clientLeases + browserSessions,
    browserSessions,
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
        const leaseEvent = `${route.kind}-lease-${route.action === "acquire"
          ? "acquired"
          : "released"}`;
        options.ownershipEvent?.(leaseEvent, {
          ...ownershipRequestDetails(body),
          clientPid: clientPid === undefined ? undefined : Number(clientPid),
          clientLeases: leases.clientLeases,
          operationLeases: leases.operationLeases,
        });
        sendJson(response, 200, { success: true, leases });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/handoff") {
        const body = await readJson(request);
        const requirement = parseAttachRequirement(body);
        const leases = leaseSnapshot(options);
        const decision = decideRuntimeCompatibility(
          options.descriptor(),
          requirement,
          leases,
        );
        options.ownershipEvent?.("compatibility-request-decided", {
          ...ownershipRequestDetails(body),
          action: decision.action,
          code: decision.code,
          requestedPayloadIdentity: requirement.payload.identity,
          requestedAppVersion: requirement.payload.appVersion,
          clientLeases: leases.clientLeases,
          browserSessions: leases.browserSessions,
          operationLeases: leases.operationLeases,
        });
        sendJson(response, decision.action === "refuse" ? 409 : 200, decision);
        if (decision.action === "handoff") options.requestHandoff(decision);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/browser-session/create") {
        const body = await readJson(request);
        const targetPath = typeof body.targetPath === "string" ? body.targetPath : "/";
        const ownership = ownershipRequestDetails(body);
        const launch = options.browserSessions.createLaunchToken(targetPath, {
          traceId: ownership.requestTraceId,
          clientName: ownership.clientName,
          userAction: ownership.userAction,
        });
        options.ownershipEvent?.("browser-launch-created", {
          ...ownership,
          activeBrowserSessions: options.browserSessions.activeSessionCount(),
        });
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
          options.ownershipEvent?.("browser-launch-exchange-refused", {
            reason: "invalid-or-expired-launch-token",
          });
          sendJson(response, 403, { error: "Browser launch token is invalid or expired" });
          return;
        }
        options.ownershipEvent?.("browser-session-started", {
          requestTraceId: session.ownership?.traceId,
          clientName: session.ownership?.clientName,
          userAction: session.ownership?.userAction,
          activeBrowserSessions: options.browserSessions.activeSessionCount(),
          sessionTtlSeconds: session.maxAgeSeconds,
        });
        sendJson(response, 200, {
          sessionId: session.sessionId,
          targetPath: session.targetPath,
          maxAgeSeconds: session.maxAgeSeconds,
        });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/browser-session/heartbeat") {
        const body = await readJson(request);
        if (typeof body.sessionId !== "string" || typeof body.pageId !== "string") {
          throw new Error("Browser sessionId and pageId are required");
        }
        const heartbeat = options.browserSessions.heartbeatSession(body.sessionId, body.pageId);
        if (!heartbeat) {
          sendJson(response, 401, { alive: false });
          return;
        }
        if (heartbeat.firstHeartbeat) {
          options.ownershipEvent?.("browser-session-heartbeat-started", {
            requestTraceId: heartbeat.ownership?.traceId,
            clientName: heartbeat.ownership?.clientName,
            userAction: heartbeat.ownership?.userAction,
            activeBrowserSessions: options.browserSessions.activeSessionCount(),
            sessionTtlSeconds: heartbeat.maxAgeSeconds,
          });
        }
        sendJson(response, 200, {
          alive: true,
          maxAgeSeconds: heartbeat.maxAgeSeconds,
        });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/browser-session/closing") {
        const body = await readJson(request);
        if (typeof body.sessionId !== "string" || typeof body.pageId !== "string") {
          throw new Error("Browser sessionId and pageId are required");
        }
        const closing = options.browserSessions.beginPageClose(body.sessionId, body.pageId);
        if (!closing) {
          sendJson(response, 401, { closing: false });
          return;
        }
        options.ownershipEvent?.("browser-session-close-received", {
          requestTraceId: closing.ownership?.traceId,
          clientName: closing.ownership?.clientName,
          userAction: closing.ownership?.userAction,
          activeBrowserSessions: options.browserSessions.activeSessionCount(),
          closeGraceSeconds: closing.closeGraceSeconds,
        });
        sendJson(response, 200, { closing: true });
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
          options.ownershipEvent?.("shutdown-request-refused", {
            ...ownershipRequestDetails(body),
            forced: false,
            clientLeases: leases.clientLeases,
            browserSessions: leases.browserSessions,
            operationLeases: leases.operationLeases,
          });
          sendJson(response, 409, {
            error: "The Runtime is busy and cannot shut down cooperatively",
            leases,
          });
          return;
        }
        options.ownershipEvent?.("shutdown-request-accepted", {
          ...ownershipRequestDetails(body),
          forced: force,
          clientLeases: leases.clientLeases,
          browserSessions: leases.browserSessions,
          operationLeases: leases.operationLeases,
        });
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
