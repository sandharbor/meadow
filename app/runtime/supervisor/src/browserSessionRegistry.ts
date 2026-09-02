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

import { createHash, randomBytes } from "node:crypto";
import type { browserSession, heartbeat, ParticipatesIn } from "../../../concepts/index.js";

interface LaunchRecord {
  targetPath: string;
  expiresAt: number;
  ownership?: BrowserSessionOwnership;
}

interface BrowserSessionOwnership {
  traceId?: string;
  clientName?: string;
  userAction?: string;
}

interface BrowserSessionRecord {
  pendingPageExpiresAt: number | null;
  pages: Map<string, number>;
  ownership?: BrowserSessionOwnership;
}

export interface BrowserSessionEvent {
  activeBrowserSessions: number;
  clientName?: string;
  expiredPages?: number;
  requestTraceId?: string;
  userAction?: string;
}

export const BROWSER_SESSION_HEARTBEAT_INTERVAL_MS = 15_000;
export const BROWSER_SESSION_HEARTBEAT_TTL_MS = 75_000;
export const BROWSER_SESSION_CLOSE_GRACE_MS = 5_000;

function secret(): string {
  return randomBytes(32).toString("base64url");
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireTargetPath(value: string): string {
  const parsed = new URL(value, "http://127.0.0.1");
  if (parsed.origin !== "http://127.0.0.1" || !value.startsWith("/") || value.startsWith("//")) {
    throw new Error("Browser launch target must be a local absolute path");
  }
  parsed.searchParams.delete("meadowLaunchToken");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export class BrowserSessionRegistry {
  private readonly launchTokens = new Map<string, LaunchRecord>();
  private readonly sessions = new Map<string, BrowserSessionRecord>();
  private activityListener?: () => void;
  private expirationListener?: (event: BrowserSessionEvent) => void;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly launchTtlMs = 60_000,
    private readonly sessionTtlMs = BROWSER_SESSION_HEARTBEAT_TTL_MS,
    private readonly closeGraceMs = BROWSER_SESSION_CLOSE_GRACE_MS,
    onSessionExpired?: (event: BrowserSessionEvent) => void,
  ) {
    this.expirationListener = onSessionExpired;
  }

  setExpirationListener(listener: (event: BrowserSessionEvent) => void): void {
    this.expirationListener = listener;
  }

  setActivityListener(listener: () => void): void {
    this.activityListener = listener;
  }

  createLaunchToken(
    targetPath: string,
    ownership?: BrowserSessionOwnership,
  ): { token: string; targetPath: string } {
    this.prune();
    const token = secret();
    const validatedTarget = requireTargetPath(targetPath);
    this.launchTokens.set(digest(token), {
      targetPath: validatedTarget,
      expiresAt: this.now() + this.launchTtlMs,
      ownership,
    });
    return { token, targetPath: validatedTarget };
  }

  exchangeLaunchToken(token: string): {
    sessionId: string;
    targetPath: string;
    maxAgeSeconds: number;
    ownership?: BrowserSessionOwnership;
  } | null {
    this.prune();
    const tokenDigest = digest(token);
    const launch = this.launchTokens.get(tokenDigest);
    if (!launch) return null;
    this.launchTokens.delete(tokenDigest);
    const sessionId = secret();
    this.sessions.set(digest(sessionId), {
      pendingPageExpiresAt: this.now() + this.sessionTtlMs,
      pages: new Map(),
      ownership: launch.ownership,
    });
    this.activityListener?.();
    return {
      sessionId,
      targetPath: launch.targetPath,
      maxAgeSeconds: Math.floor(this.sessionTtlMs / 1_000),
      ownership: launch.ownership,
    };
  }

  validateSession(sessionId: string): boolean {
    this.prune();
    return this.sessions.has(digest(sessionId));
  }

  heartbeatSession(sessionId: string, pageId: string): {
    firstHeartbeat: boolean;
    maxAgeSeconds: number;
    ownership?: BrowserSessionOwnership;
  } | null {
    this.requirePageId(pageId);
    this.prune();
    const session = this.sessions.get(digest(sessionId));
    if (!session) return null;
    const firstHeartbeat = session.pendingPageExpiresAt !== null && session.pages.size === 0;
    session.pendingPageExpiresAt = null;
    session.pages.set(pageId, this.now() + this.sessionTtlMs);
    this.activityListener?.();
    return {
      firstHeartbeat,
      maxAgeSeconds: Math.floor(this.sessionTtlMs / 1_000),
      ownership: session.ownership,
    };
  }

  beginPageClose(sessionId: string, pageId: string): {
    closeGraceSeconds: number;
    ownership?: BrowserSessionOwnership;
  } | null {
    this.requirePageId(pageId);
    this.prune();
    const session = this.sessions.get(digest(sessionId));
    if (!session) return null;
    const currentExpiry = session.pages.get(pageId);
    if (currentExpiry === undefined) return null;
    session.pages.set(pageId, Math.min(currentExpiry, this.now() + this.closeGraceMs));
    this.activityListener?.();
    return {
      closeGraceSeconds: Math.ceil(this.closeGraceMs / 1_000),
      ownership: session.ownership,
    };
  }

  activeSessionCount(): number {
    this.prune();
    return this.sessions.size;
  }

  private prune(): void {
    const now = this.now();
    for (const [token, value] of this.launchTokens) {
      if (value.expiresAt <= now) this.launchTokens.delete(token);
    }
    for (const [sessionId, session] of this.sessions) {
      let expiredPages = 0;
      if (session.pendingPageExpiresAt !== null && session.pendingPageExpiresAt <= now) {
        session.pendingPageExpiresAt = null;
      }
      for (const [pageId, expiresAt] of session.pages) {
        if (expiresAt <= now) {
          session.pages.delete(pageId);
          expiredPages += 1;
        }
      }
      if (session.pendingPageExpiresAt === null && session.pages.size === 0) {
        this.sessions.delete(sessionId);
        this.activityListener?.();
        this.expirationListener?.({
          activeBrowserSessions: this.sessions.size,
          clientName: session.ownership?.clientName,
          expiredPages,
          requestTraceId: session.ownership?.traceId,
          userAction: session.ownership?.userAction,
        });
      }
    }
  }

  private requirePageId(pageId: string): void {
    if (!pageId || pageId.length > 200) {
      throw new Error("A bounded browser pageId is required");
    }
  }
}

export type BrowserSessionMeadowConceptParticipations = [
  ParticipatesIn<typeof browserSession, "exchange-and-track", typeof BrowserSessionRegistry>,
  ParticipatesIn<typeof heartbeat, "renew-page-liveness", typeof BrowserSessionRegistry.prototype.heartbeatSession>,
];
