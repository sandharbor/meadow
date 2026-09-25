#!/usr/bin/env npx tsx
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

/**
 * Starts a MinIO container for e2e publish tests.
 *
 * - Finds a free port
 * - Starts MinIO via Docker on that port
 * - Waits for the health endpoint
 * - Creates the test bucket
 * - Outputs JSON to stdout: { port, endpoint, containerName }
 */

import { execFileSync, spawn, spawnSync } from "child_process";
import { createServer } from "net";
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";

const BUCKET_PREFIX = "meadow-e2e-test";
const CONTAINER_PREFIX = "meadow-minio-e2e";
const MAX_START_ATTEMPTS = 3;
const READY_TIMEOUT_MS = 45_000;
const WORKER_COUNT = parseInt(process.argv[2] || "1", 10);

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not determine port")));
      }
    });
    server.on("error", reject);
  });
}

function startMinIO(port: number, containerName: string): void {
  process.stderr.write(`Starting MinIO on port ${port}...\n`);
  const proc = spawn("docker", [
    "run", "--rm",
    "--name", containerName,
    "-p", `${port}:9000`,
    "-e", "MINIO_ROOT_USER=FAKE-E2E-MINIO-ACCESS-KEY",
    "-e", "MINIO_ROOT_PASSWORD=FAKE-E2E-MINIO-SECRET-KEY",
    "minio/minio",
    "server", "/data",
  ], {
    stdio: "ignore",
    detached: true,
  });
  proc.unref();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitForMinIO(port: number, maxWaitMs: number): Promise<void> {
  const endpoint = `http://localhost:${port}/minio/health/live`;
  const start = Date.now();
  let lastError: unknown;

  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        process.stderr.write("MinIO is ready.\n");
        return;
      }
      lastError = new Error(`health endpoint returned HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `MinIO did not become ready within ${maxWaitMs}ms. ` +
    `Last readiness error: ${errorMessage(lastError)}`,
  );
}

async function createBuckets(port: number, workerCount: number): Promise<void> {
  const s3 = new S3Client({
    endpoint: `http://localhost:${port}`,
    region: "us-west-2",
    forcePathStyle: true,
    credentials: {
      accessKeyId: "FAKE-E2E-MINIO-ACCESS-KEY",
      secretAccessKey: "FAKE-E2E-MINIO-SECRET-KEY",
    },
  });

  for (let i = 0; i < workerCount; i++) {
    const bucketName = `${BUCKET_PREFIX}-${i}`;
    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    process.stderr.write(`Created bucket: ${bucketName}\n`);
  }
  s3.destroy();
}

function stopContainer(containerName: string): void {
  try {
    execFileSync("docker", ["stop", containerName], { stdio: "ignore" });
  } catch {
    // The container may already be stopped or removed.
  }
}

function printContainerLogs(containerName: string): void {
  const result = spawnSync(
    "docker",
    ["logs", "--tail", "100", containerName],
    { encoding: "utf8" },
  );
  const logs = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (logs) {
    process.stderr.write(`MinIO container logs (${containerName}):\n${logs}\n`);
  }
}

async function main(): Promise<void> {
  let activeContainerName: string | undefined;

  const cleanup = () => {
    if (activeContainerName) stopContainer(activeContainerName);
  };
  process.on("SIGINT", () => { cleanup(); process.exit(1); });
  process.on("SIGTERM", () => { cleanup(); process.exit(1); });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt += 1) {
    const port = await findFreePort();
    const containerName = `${CONTAINER_PREFIX}-${Date.now()}-${attempt}`;
    activeContainerName = containerName;

    if (attempt > 1) {
      process.stderr.write(
        `Retrying MinIO startup (attempt ${attempt}/${MAX_START_ATTEMPTS})...\n`,
      );
    }

    try {
      startMinIO(port, containerName);
      await waitForMinIO(port, READY_TIMEOUT_MS);
      await createBuckets(port, WORKER_COUNT);

      const result = {
        port,
        endpoint: `http://localhost:${port}`,
        containerName,
      };
      activeContainerName = undefined;
      process.stdout.write(JSON.stringify(result));
      return;
    } catch (error) {
      lastError = error;
      process.stderr.write(
        `MinIO startup attempt ${attempt}/${MAX_START_ATTEMPTS} failed: ` +
        `${errorMessage(error)}\n`,
      );
      printContainerLogs(containerName);
      cleanup();
      activeContainerName = undefined;
    }
  }

  throw new Error(
    `MinIO failed to start after ${MAX_START_ATTEMPTS} attempts. ` +
    `Last error: ${errorMessage(lastError)}`,
  );
}

main().catch((err) => {
  process.stderr.write(`Error starting MinIO: ${err}\n`);
  process.exit(1);
});
