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

import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import {
  startTestWebServer,
  stopTestWebServer,
} from "../../src/run/scripts/test_web_server_process.js";

const E2E_DIR = path.resolve(import.meta.dirname, "../..");

test("parallel test web servers receive distinct atomically bound ports", async () => {
  const launchResults = await Promise.allSettled(
    Array.from({ length: 16 }, (_, workerIndex) => startTestWebServer({
      e2eDir: E2E_DIR,
      minioEndpoint: "http://127.0.0.1:1",
      minioBucket: `test-bucket-${workerIndex}`,
      timeoutMs: 30_000,
    })),
  );
  const servers = launchResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );

  try {
    const failures = launchResults.flatMap((result) =>
      result.status === "rejected" ? [String(result.reason)] : []
    );
    assert.deepEqual(failures, []);

    const ports = servers.map((server) => server.port);
    assert.equal(new Set(ports).size, servers.length);

    const responses = await Promise.all(
      servers.map((server) => fetch(server.url)),
    );
    assert.deepEqual(
      responses.map((response) => response.status),
      servers.map(() => 400),
    );
  } finally {
    await Promise.all(
      servers.map((server) => stopTestWebServer(server.process)),
    );
  }
});
