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

import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, unlinkSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { MEADOW_RUNTIME_SESSION_ENV } from "../../../../../contracts/types/runtime.js";
import { readRuntimeSessionDescriptor } from "../../../../../runtime/supervisor/src/sessionDescriptor.js";
import type { MeadowCommandRecord, TrialPhase } from "../types.js";

interface BrokerRequest {
  schemaVersion: 1;
  args: string[];
  cwd: string;
}

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;

export class MeadowCommandBroker {
  readonly records: MeadowCommandRecord[] = [];
  private server: net.Server | null = null;

  constructor(private readonly options: {
    socketPath: string;
    binDirectory: string;
    cliExecutable: string;
    cliWorkingDirectory: string;
    runtimeSessionPath: string;
    phase: () => TrialPhase;
  }) {}

  async start(): Promise<void> {
    mkdirSync(path.dirname(this.options.socketPath), { recursive: true, mode: 0o700 });
    try {
      unlinkSync(this.options.socketPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    mkdirSync(this.options.binDirectory, { recursive: true, mode: 0o755 });
    const clientSource = path.join(import.meta.dirname, "meadow-client.mjs");
    const clientExecutable = path.join(this.options.binDirectory, "meadow");
    copyFileSync(clientSource, clientExecutable);
    chmodSync(clientExecutable, 0o555);

    this.server = net.createServer(socket => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.options.socketPath, () => {
        this.server!.off("error", reject);
        chmodSync(this.options.socketPath, 0o600);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  private handleConnection(socket: net.Socket): void {
    let requestBuffer = "";
    socket.on("data", chunk => {
      if (requestBuffer.includes("\n")) return;
      requestBuffer += chunk.toString("utf8");
      if (Buffer.byteLength(requestBuffer) > MAX_REQUEST_BYTES) {
        this.send(socket, { type: "error", message: "Meadow command request is too large." });
        socket.end();
        return;
      }
      const newline = requestBuffer.indexOf("\n");
      if (newline === -1) return;
      const requestText = requestBuffer.slice(0, newline);
      let request: BrokerRequest;
      try {
        request = JSON.parse(requestText) as BrokerRequest;
      } catch {
        this.send(socket, { type: "error", message: "Invalid Meadow command request." });
        socket.end();
        return;
      }
      void this.execute(socket, request);
    });
  }

  private async execute(socket: net.Socket, request: BrokerRequest): Promise<void> {
    if (
      request.schemaVersion !== 1
      || !Array.isArray(request.args)
      || !request.args.every(arg => typeof arg === "string" && !arg.includes("\0"))
      || typeof request.cwd !== "string"
    ) {
      this.send(socket, { type: "error", message: "Unsupported Meadow command request." });
      socket.end();
      return;
    }

    const startedAt = new Date();
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let capturedBytes = 0;
    const descriptor = readRuntimeSessionDescriptor(this.options.runtimeSessionPath);
    const child = spawn(this.options.cliExecutable, request.args, {
      cwd: this.options.cliWorkingDirectory,
      env: {
        ...process.env,
        [MEADOW_RUNTIME_SESSION_ENV]: this.options.runtimeSessionPath,
        MEADOW_HOME_DIRECTORY_OVERRIDE: descriptor.homeDirectory,
        MEADOW_APP_VERSION: descriptor.payload.appVersion,
        MEADOW_BUILD_PERSPECTIVE: descriptor.payload.perspective,
        MEADOW_RUNTIME_PAYLOAD_IDENTITY: descriptor.payload.identity,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const capture = (target: Buffer[], type: "stdout" | "stderr", chunk: Buffer): void => {
      this.send(socket, { type, data: chunk.toString("utf8") });
      if (capturedBytes >= MAX_COMMAND_OUTPUT_BYTES) return;
      const remaining = MAX_COMMAND_OUTPUT_BYTES - capturedBytes;
      const kept = chunk.subarray(0, remaining);
      target.push(kept);
      capturedBytes += kept.byteLength;
    };
    child.stdout.on("data", (chunk: Buffer) => capture(stdout, "stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => capture(stderr, "stderr", chunk));
    child.on("error", error => {
      capture(stderr, "stderr", Buffer.from(`${error.message}\n`));
    });
    const exitCode = await new Promise<number>(resolve => {
      child.on("close", code => resolve(code ?? 70));
    });
    const finishedAt = new Date();
    this.records.push({
      id: `command-${this.records.length + 1}`,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      args: [...request.args],
      cwd: request.cwd,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
      exitCode,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      phase: this.options.phase(),
    });
    this.send(socket, { type: "exit", exitCode });
    socket.end();
  }

  private send(socket: net.Socket, event: Record<string, unknown>): void {
    if (!socket.destroyed) socket.write(`${JSON.stringify(event)}\n`);
  }
}
