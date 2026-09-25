/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadLocalServices } from "./extensions.js";
import type { LocalServiceContainer, LocalServicePart } from "./parts.js";
import type { localServices, ParticipatesIn } from "../../../concepts/index.js";

/**
 * One owner for the shared Local Services containers. E2E runs and Dev Tools
 * sessions are holders; a container stops only when no live holder remains,
 * so finishing an E2E run never pulls services out from under an open fork.
 */

interface OwnerState {
  version: 1;
  containers: Record<string, LocalServiceContainer>;
  holders: Record<string, { pid: number; acquiredAt: string }>;
}

export function localServicesDirectory(): string {
  return process.env.MEADOW_LOCAL_SERVICES_DIRECTORY ?? path.join(os.tmpdir(), "meadow-local-services");
}

function statePath(): string {
  return path.join(localServicesDirectory(), "state.json");
}

function readState(): OwnerState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), "utf8")) as OwnerState;
    if (parsed.version === 1) return parsed;
  } catch {
    // Missing or unreadable state means no services are known to be running.
  }
  return { version: 1, containers: {}, holders: {} };
}

function writeState(state: OwnerState): void {
  fs.mkdirSync(localServicesDirectory(), { recursive: true });
  const temporary = `${statePath()}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, statePath());
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function withOwnerLock<T>(action: () => Promise<T>): Promise<T> {
  const lock = path.join(localServicesDirectory(), "owner.lock");
  fs.mkdirSync(localServicesDirectory(), { recursive: true });
  const deadline = Date.now() + 120_000;
  while (true) {
    try {
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, "pid"), String(process.pid));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let holder = 0;
      try { holder = Number(fs.readFileSync(path.join(lock, "pid"), "utf8")); } catch { /* being written */ }
      if (holder && !processIsAlive(holder)) {
        fs.rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for the Local Services lock at ${lock}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  try {
    return await action();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

let stopContainer = (container: LocalServiceContainer): void => {
  try {
    execFileSync("docker", ["stop", container.containerName], { stdio: "ignore" });
  } catch {
    // Already stopped or removed.
  }
};

/** Tests observe container shutdown without Docker. */
export function setContainerStopperForTests(stopper: (container: LocalServiceContainer) => void): void {
  stopContainer = stopper;
}

function pruneDeadHolders(state: OwnerState): void {
  for (const [holder, record] of Object.entries(state.holders)) {
    if (!processIsAlive(record.pid)) delete state.holders[holder];
  }
}

export interface AcquiredLocalServices {
  parts: LocalServicePart[];
  containers: Record<string, LocalServiceContainer>;
}

/**
 * Register a holder and make sure every part's container is running and
 * healthy. Safe to call from many processes at once.
 */
export async function acquireLocalServices(
  holder: string,
  options: { pid?: number; parts?: LocalServicePart[] } = {},
): Promise<AcquiredLocalServices> {
  const parts = options.parts ?? (await loadLocalServices()).parts;
  const pid = options.pid ?? process.pid;
  return await withOwnerLock(async () => {
    const state = readState();
    pruneDeadHolders(state);
    for (const part of parts) {
      const existing = state.containers[part.id];
      if (existing && await part.isHealthy(existing)) continue;
      if (existing) stopContainer(existing);
      state.containers[part.id] = await part.startContainer();
    }
    state.holders[holder] = { pid, acquiredAt: new Date().toISOString() };
    writeState(state);
    return { parts, containers: { ...state.containers } };
  });
}

/** Read the running containers without registering a holder. */
export async function readLocalServices(options: { parts?: LocalServicePart[] } = {}): Promise<AcquiredLocalServices> {
  const parts = options.parts ?? (await loadLocalServices()).parts;
  const state = readState();
  for (const part of parts) {
    if (!state.containers[part.id]) throw new Error(`Local Services are not running (${part.displayName}); acquire them first`);
  }
  return { parts, containers: state.containers };
}

/** Remove a holder. Containers stop when no live holder remains. */
export async function releaseLocalServices(holder: string): Promise<void> {
  await withOwnerLock(async () => {
    const state = readState();
    delete state.holders[holder];
    pruneDeadHolders(state);
    if (Object.keys(state.holders).length === 0) {
      for (const container of Object.values(state.containers)) stopContainer(container);
      state.containers = {};
    }
    writeState(state);
  });
}

export function localServiceHolders(): string[] {
  const state = readState();
  pruneDeadHolders(state);
  return Object.keys(state.holders).sort();
}

export type LocalServicesOwnerMeadowConceptParticipations = [
  ParticipatesIn<typeof localServices, "hold-containers", typeof acquireLocalServices>,
];
