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

import { execSync, spawn, ChildProcess } from "child_process";
import { createServer } from "net";
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";

const BUCKET_PREFIX = "meadow-e2e-test";
const CONTAINER_PREFIX = "meadow-minio-e2e";
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

function startMinIO(port: number, containerName: string): ChildProcess {
  process.stderr.write(`Starting MinIO on port ${port}...\n`);
  const proc = spawn("docker", [
    "run", "--rm",
    "--name", containerName,
    "-p", `${port}:9000`,
    "-e", "MINIO_ROOT_USER=minioadmin",
    "-e", "MINIO_ROOT_PASSWORD=minioadmin",
    "minio/minio",
    "server", "/data",
  ], {
    stdio: "ignore",
    detached: true,
  });
  proc.unref();
  return proc;
}

async function waitForMinIO(port: number, maxWaitMs = 30000): Promise<void> {
  const endpoint = `http://localhost:${port}/minio/health/live`;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        process.stderr.write("MinIO is ready.\n");
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`MinIO did not become ready within ${maxWaitMs}ms`);
}

async function createBuckets(port: number, workerCount: number): Promise<void> {
  const s3 = new S3Client({
    endpoint: `http://localhost:${port}`,
    region: "us-west-2",
    forcePathStyle: true,
    credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
  });

  for (let i = 0; i < workerCount; i++) {
    const bucketName = `${BUCKET_PREFIX}-${i}`;
    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    process.stderr.write(`Created bucket: ${bucketName}\n`);
  }
  s3.destroy();
}

async function main(): Promise<void> {
  const port = await findFreePort();
  const containerName = `${CONTAINER_PREFIX}-${Date.now()}`;

  const proc = startMinIO(port, containerName);

  // Ensure cleanup if this script is killed before it prints output
  const cleanup = () => {
    try {
      execSync(`docker stop ${containerName}`, { stdio: "ignore" });
    } catch { /* already stopped */ }
  };
  process.on("SIGINT", () => { cleanup(); process.exit(1); });
  process.on("SIGTERM", () => { cleanup(); process.exit(1); });

  try {
    await waitForMinIO(port);
    await createBuckets(port, WORKER_COUNT);

    // Output JSON to stdout for the caller to parse
    const result = { port, endpoint: `http://localhost:${port}`, containerName };
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    cleanup();
    throw error;
  }
}

main().catch((err) => {
  process.stderr.write(`Error starting MinIO: ${err}\n`);
  process.exit(1);
});
