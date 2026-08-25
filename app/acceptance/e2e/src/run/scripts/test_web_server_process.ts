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

import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import path from "node:path";

export interface TestWebServerProcess {
  process: ChildProcessWithoutNullStreams;
  port: number;
  url: string;
  diagnostics: () => string;
}

export interface StartTestWebServerOptions {
  e2eDir: string;
  minioEndpoint: string;
  minioBucket: string;
  timeoutMs?: number;
}

function formatExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
): Error {
  const details = stderr.trim();
  return new Error(
    `Test web server exited before readiness (code=${code}, signal=${signal})` +
    (details ? `\n${details}` : ""),
  );
}

export function startTestWebServer({
  e2eDir,
  minioEndpoint,
  minioBucket,
  timeoutMs = 15_000,
}: StartTestWebServerOptions): Promise<TestWebServerProcess> {
  const scriptPath = path.join(
    e2eDir,
    "src/run/scripts/start_web_server.ts",
  );
  const proc = spawn(
    process.execPath,
    ["--import", "tsx", scriptPath, "0"],
    {
      cwd: e2eDir,
      env: {
        ...process.env,
        MINIO_ENDPOINT: minioEndpoint,
        MINIO_BUCKET: minioBucket,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  proc.stdin.end();
  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");

  let stdout = "";
  let stderr = "";
  proc.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (
      error: Error | null,
      readiness?: { port: number; url: string },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      proc.stdout.off("data", onStdout);
      proc.off("exit", onExit);

      if (error) {
        if (proc.exitCode === null && proc.signalCode === null) {
          proc.kill("SIGTERM");
        }
        reject(error);
        return;
      }

      proc.stdout.resume();
      resolve({
        process: proc,
        port: readiness!.port,
        url: readiness!.url,
        diagnostics: () => stderr.trim(),
      });
    };

    const onStdout = (chunk: string) => {
      stdout += chunk;
      const newline = stdout.indexOf("\n");
      if (newline < 0) return;

      const line = stdout.slice(0, newline).trim();
      try {
        const parsed = JSON.parse(line) as { port?: unknown; url?: unknown };
        if (
          typeof parsed.port !== "number" ||
          !Number.isInteger(parsed.port) ||
          parsed.port <= 0 ||
          typeof parsed.url !== "string"
        ) {
          throw new Error(`Invalid readiness payload: ${line}`);
        }
        finish(null, { port: parsed.port, url: parsed.url });
      } catch (error) {
        finish(
          new Error(
            `Test web server emitted invalid readiness output: ${String(error)}` +
            (stderr.trim() ? `\n${stderr.trim()}` : ""),
          ),
        );
      }
    };

    const onExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      finish(formatExit(code, signal, stderr));
    };

    const timeout = setTimeout(() => {
      finish(
        new Error(
          `Timed out waiting ${timeoutMs}ms for test web server readiness` +
          (stderr.trim() ? `\n${stderr.trim()}` : ""),
        ),
      );
    }, timeoutMs);

    proc.stdout.on("data", onStdout);
    proc.on("exit", onExit);
  });
}

export async function stopTestWebServer(
  proc: ChildProcessWithoutNullStreams,
  timeoutMs = 3_000,
): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;

  proc.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill("SIGKILL");
      }
      resolve();
    }, timeoutMs);
    proc.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
