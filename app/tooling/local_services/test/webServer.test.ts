/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";
import { startWebServer, stopWebServer } from "../src/webServer.js";

test("parallel web servers receive distinct atomically bound ports", async () => {
  const launchResults = await Promise.allSettled(
    Array.from({ length: 16 }, (_, workerIndex) => startWebServer({
      minioEndpoint: "http://127.0.0.1:1",
      minioBucket: `test-bucket-${workerIndex}`,
      timeoutMs: 30_000,
    })),
  );
  const servers = launchResults.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  try {
    assert.deepEqual(launchResults.flatMap(result => result.status === "rejected" ? [String(result.reason)] : []), []);
    assert.equal(new Set(servers.map(server => server.port)).size, servers.length);
    const responses = await Promise.all(servers.map(server => fetch(server.url)));
    assert.deepEqual(responses.map(response => response.status), servers.map(() => 400));
  } finally {
    await Promise.all(servers.map(server => stopWebServer(server.process)));
  }
});

test("a restored saved state reuses its recorded port when free and falls back when taken", async () => {
  const first = await startWebServer({ minioEndpoint: "http://127.0.0.1:1", minioBucket: "b" });
  const port = first.port;
  try {
    const busy = await startWebServer({ minioEndpoint: "http://127.0.0.1:1", minioBucket: "b", port });
    assert.notEqual(busy.port, port);
    await stopWebServer(busy.process);
  } finally {
    await stopWebServer(first.process);
  }
  await new Promise<void>(resolve => {
    const probe = net.createServer().listen(port, "127.0.0.1", () => probe.close(() => resolve()));
  });
  const reused = await startWebServer({ minioEndpoint: "http://127.0.0.1:1", minioBucket: "b", port });
  assert.equal(reused.port, port);
  await stopWebServer(reused.process);
});
