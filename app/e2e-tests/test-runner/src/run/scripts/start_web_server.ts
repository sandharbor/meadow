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
 * Lightweight HTTP server that proxies requests to MinIO,
 * replicating the CloudFront → S3 path used in production.
 *
 * Usage:
 *   MINIO_ENDPOINT=http://localhost:9000 MINIO_BUCKET=meadow-e2e-test \
 *     npx tsx start_web_server.ts <port>
 *
 * Outputs JSON to stdout once listening: { "port": <n>, "url": "http://localhost:<n>" }
 */

import http from "http";
import path from "path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

const port = parseInt(process.argv[2], 10);
if (!port || isNaN(port)) {
  process.stderr.write("Usage: start_web_server.ts <port>\n");
  process.exit(1);
}

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT;
const MINIO_BUCKET = process.env.MINIO_BUCKET;

if (!MINIO_ENDPOINT || !MINIO_BUCKET) {
  process.stderr.write("MINIO_ENDPOINT and MINIO_BUCKET env vars are required.\n");
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: MINIO_ENDPOINT,
  region: "us-west-2",
  forcePathStyle: true,
  credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
});

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function getContentType(key: string): string {
  const ext = path.extname(key).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

const server = http.createServer(async (req, res) => {
  if (!req.url || req.method !== "GET") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  // Decode the URL path and strip leading slash to get the S3 key
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const key = urlPath.replace(/^\//, "");

  if (!key) {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: key })
    );

    const contentType = getContentType(key);
    res.writeHead(200, { "Content-Type": contentType });

    const body = result.Body as Readable;
    body.pipe(res);
  } catch (err: unknown) {
    const code = (err as { name?: string }).name;
    if (code === "NoSuchKey" || code === "NotFound") {
      res.writeHead(404);
      res.end("Not Found");
    } else {
      process.stderr.write(`S3 error for key "${key}": ${err}\n`);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  }
});

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  process.stderr.write(`Web server listening on ${url}\n`);
  // Output JSON for Playwright to detect readiness
  process.stdout.write(JSON.stringify({ port, url }));
});
