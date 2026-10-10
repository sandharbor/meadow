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

/** Strip terminal colour codes so startup lines can be matched. */
const plain = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, "");

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
  let logs = "";
  const children: ChildProcess[] = [];
  // A port chosen up front can be taken by another worker before it is bound.
  // The server binds port 0 and reports the port it got; Vite cannot bind port
  // 0, so a client that finds its port taken retries with another.
  const start = (args: string[], env: Record<string, string>) => {
    const child = spawn(process.execPath, args, {
      cwd: DEV_TOOLS_DIR,
      env: { ...process.env, MEADOW_DEV_NO_BROWSER: "1", ...environment, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", bytes => { logs += String(bytes); });
    child.stderr?.on("data", bytes => { logs += String(bytes); });
    children.push(child);
    return child;
  };
  const stop = async () => { for (const child of children.reverse()) await stopProcess(child); };
  const reportedPort = async (child: ChildProcess, line: RegExp) => {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const match = plain(logs).match(line);
      if (match) return Number(match[1]);
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Dev Tools exited during startup:\n${logs}`);
      if (Date.now() > deadline) throw new Error(`Dev Tools did not report its port within 60s:\n${logs}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  try {
    const server = start(["--import", "tsx", "src/server/index.ts"], { PORT: "0" });
    const serverPort = await reportedPort(server, /Dev Tools Server running on http:\/\/localhost:(\d+)/);
    let clientPort: number | undefined;
    for (let attempt = 1; clientPort === undefined; attempt++) {
      const port = await availablePort();
      const client = start(["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--strictPort"], { PORT: String(serverPort), VITE_DEV_TOOLS_CLIENT_PORT: String(port) });
      try {
        clientPort = await reportedPort(client, new RegExp(`Local:\\s+http://127\\.0\\.0\\.1:(${port})/`));
      } catch (error) {
        if (attempt === 3 || !plain(logs).includes(`Port ${port} is already in use`)) throw error;
      }
    }
    const serverUrl = `http://127.0.0.1:${serverPort}`;
    const clientUrl = `http://127.0.0.1:${clientPort}`;
    for (const url of [`${serverUrl}/api/saved-states`, clientUrl]) {
      await expect.poll(async () => {
        try { return (await fetch(url)).ok; } catch { return false; }
      }, { timeout: 60_000, message: `Dev Tools did not answer ${url}:\n${logs}` }).toBe(true);
    }
    return { serverUrl, clientUrl, logs: () => logs, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
