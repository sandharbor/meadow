/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { minioPart } from "../src/minio.js";

const container = { endpoint: "http://localhost:9000", containerName: "test-minio" };

test("MinIO checkpoints capture every object and content type with bounded concurrent reads", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "minio-capture-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const keys = Array.from({ length: 19 }, (_, index) => `nested/object-${index}.bin`);
  const bytes = Buffer.from([0, 255, 128, 13, 10]);
  let active = 0;
  let peak = 0;
  t.mock.method(S3Client.prototype, "send", async (command: unknown) => {
    if (command instanceof ListObjectsV2Command) {
      const secondPage = Boolean(command.input.ContinuationToken);
      return {
        Contents: (secondPage ? keys.slice(10) : keys.slice(0, 10)).map(Key => ({ Key })),
        ...(!secondPage && { NextContinuationToken: "page-two" }),
      };
    }
    assert.ok(command instanceof GetObjectCommand);
    active += 1;
    peak = Math.max(peak, active);
    return {
      ContentType: "application/octet-stream",
      Body: { async transformToByteArray() {
        await new Promise(resolve => setImmediate(resolve));
        active -= 1;
        return bytes;
      } },
    };
  });
  assert.equal(await minioPart.capture(container, "capture-test", directory), true);
  assert.ok(peak > 1 && peak <= 8, `unexpected concurrent reads: ${peak}`);
  assert.equal(active, 0);
  for (const key of keys) {
    assert.deepEqual(fs.readFileSync(path.join(directory, "objects", key)), bytes);
    assert.equal(fs.readFileSync(path.join(directory, "content-types", `${key}.txt`), "utf8"), "application/octet-stream");
  }
});

test("MinIO checkpoint failures wait for in-flight reads before closing the client", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "minio-capture-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let pending = 0;
  let destroyed = false;
  t.mock.method(S3Client.prototype, "destroy", () => {
    assert.equal(pending, 0);
    destroyed = true;
  });
  t.mock.method(S3Client.prototype, "send", async (command: unknown) => {
    if (command instanceof ListObjectsV2Command) return { Contents: [{ Key: "failed" }, { Key: "pending" }] };
    assert.ok(command instanceof GetObjectCommand);
    if (command.input.Key === "failed") throw new Error("read failed");
    pending += 1;
    return { Body: { async transformToByteArray() {
      await new Promise(resolve => setImmediate(resolve));
      pending -= 1;
      return Buffer.from("completed");
    } } };
  });
  await assert.rejects(minioPart.capture(container, "capture-test", directory), /read failed/);
  assert.equal(destroyed, true);
  assert.equal(fs.readFileSync(path.join(directory, "objects", "pending"), "utf8"), "completed");
});
