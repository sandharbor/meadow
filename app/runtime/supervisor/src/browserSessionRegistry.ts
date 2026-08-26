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
import type { browserSession, ParticipatesIn } from "../../../concepts/index.js";

interface LaunchRecord {
  targetPath: string;
  expiresAt: number;
}

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
  private readonly sessions = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly launchTtlMs = 60_000,
    private readonly sessionTtlMs = 15 * 60 * 1_000,
  ) {}

  createLaunchToken(targetPath: string): { token: string; targetPath: string } {
    this.prune();
    const token = secret();
    const validatedTarget = requireTargetPath(targetPath);
    this.launchTokens.set(digest(token), {
      targetPath: validatedTarget,
      expiresAt: this.now() + this.launchTtlMs,
    });
    return { token, targetPath: validatedTarget };
  }

  exchangeLaunchToken(token: string): {
    sessionId: string;
    targetPath: string;
    maxAgeSeconds: number;
  } | null {
    this.prune();
    const tokenDigest = digest(token);
    const launch = this.launchTokens.get(tokenDigest);
    if (!launch) return null;
    this.launchTokens.delete(tokenDigest);
    const sessionId = secret();
    this.sessions.set(digest(sessionId), this.now() + this.sessionTtlMs);
    return {
      sessionId,
      targetPath: launch.targetPath,
      maxAgeSeconds: Math.floor(this.sessionTtlMs / 1_000),
    };
  }

  validateSession(sessionId: string): boolean {
    this.prune();
    const sessionDigest = digest(sessionId);
    const expiresAt = this.sessions.get(sessionDigest);
    if (expiresAt === undefined || expiresAt <= this.now()) return false;
    this.sessions.set(sessionDigest, this.now() + this.sessionTtlMs);
    return true;
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
    for (const [sessionId, expiresAt] of this.sessions) {
      if (expiresAt <= now) this.sessions.delete(sessionId);
    }
  }
}

export type BrowserSessionMeadowConceptParticipations = [
  ParticipatesIn<typeof browserSession, "exchange-and-track", typeof BrowserSessionRegistry>,
];
