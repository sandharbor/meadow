/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { Expect } from "@playwright/test";

const DEV_TOOLS_DIR = path.resolve(import.meta.dirname, "../../../../tooling/dev_tools");

async function availablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a Dev Tools test port");
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await exited;
}

export interface RunningDevTools {
  serverUrl: string;
  clientUrl: string;
  logs: () => string;
  stop: () => Promise<void>;
}

/**
 * Run the real Dev Tools server and client for a scenario. Browser launches
 * return their URL instead of driving the desktop's Chrome.
 */
export async function startDevTools(expect: Expect, environment: Record<string, string>): Promise<RunningDevTools> {
  const [serverPort, clientPort] = await Promise.all([availablePort(), availablePort()]);
  const env = {
    ...process.env,
    PORT: String(serverPort),
    VITE_DEV_TOOLS_CLIENT_PORT: String(clientPort),
    MEADOW_DEV_NO_BROWSER: "1",
    ...environment,
  };
  let logs = "";
  const start = (args: string[]) => {
    const child = spawn(process.execPath, args, { cwd: DEV_TOOLS_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.on("data", bytes => { logs += String(bytes); });
    child.stderr?.on("data", bytes => { logs += String(bytes); });
    return child;
  };
  const server = start(["--import", "tsx", "src/server/index.ts"]);
  const client = start(["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--strictPort"]);
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const clientUrl = `http://127.0.0.1:${clientPort}`;
  for (const url of [`${serverUrl}/api/saved-states`, clientUrl]) {
    await expect.poll(async () => {
      try { return (await fetch(url)).ok; } catch { return false; }
    }, { timeout: 60_000 }).toBe(true);
  }
  return {
    serverUrl,
    clientUrl,
    logs: () => logs,
    stop: async () => { await stopProcess(client); await stopProcess(server); },
  };
}
