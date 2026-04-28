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
 * Lightweight static file server that replaces `vite` dev mode in e2e tests.
 *
 * Why: the vite dev server transforms modules on demand on the first browser
 * request, which costs ~1.8s per test (183 modules compiled cold every time
 * the frontend fixture is spawned). Serving a pre-built bundle eliminates that
 * cost entirely — each test sees the app render almost immediately after
 * `page.goto("/")`.
 *
 * Behavior:
 * - Serves static files from <distDir>.
 * - Proxies `/api/*` to `http://127.0.0.1:<backendPort>` (matches the vite
 *   dev server's proxy config — see app/frontend/vite.config.ts).
 *
 * Usage:
 *   npx tsx start_static_frontend.ts <port> <backendPort> <distDir>
 */

import http from "http";
import fs from "fs";
import path from "path";

const port = parseInt(process.argv[2], 10);
const backendPort = parseInt(process.argv[3], 10);
const distDir = process.argv[4];

if (!port || isNaN(port) || !backendPort || isNaN(backendPort) || !distDir) {
  process.stderr.write("Usage: start_static_frontend.ts <port> <backendPort> <distDir>\n");
  process.exit(1);
}

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  process.stderr.write(`distDir missing index.html: ${distDir}\n`);
  process.exit(1);
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

const absDistDir = path.resolve(distDir);

function serveFile(res: http.ServerResponse, filePath: string) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || "/";

  // Proxy /api/* to backend
  if (rawUrl.startsWith("/api")) {
    const proxyReq = http.request(
      {
        host: "127.0.0.1",
        port: backendPort,
        method: req.method,
        path: rawUrl,
        headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", (err) => {
      // Surface the underlying error (ECONNREFUSED, ECONNRESET, timeout,
      // ...) on stderr so e2e fixtures that capture the static-frontend
      // stderr can diagnose 502 flakes — the browser only sees the status
      // code, not the cause.
      const errCode = (err as NodeJS.ErrnoException).code || "";
      process.stderr.write(
        `proxy error: ${req.method} ${rawUrl}: ${errCode ? errCode + " " : ""}${err.message}\n`,
      );
      if (!res.headersSent) {
        res.writeHead(502);
        res.end("Bad Gateway");
      } else {
        res.end();
      }
    });
    req.pipe(proxyReq);
    return;
  }

  // Serve static files from dist
  const urlPath = decodeURIComponent(rawUrl.split("?")[0]);
  const relPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.resolve(path.join(absDistDir, relPath));

  // Guard against path traversal
  if (!filePath.startsWith(absDistDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // If the file doesn't exist, fall back to index.html so client-side routing
  // (BrowserRouter routes like /site/:slug) still resolves.
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      serveFile(res, path.join(absDistDir, "index.html"));
      return;
    }
    serveFile(res, filePath);
  });
});

server.listen(port, () => {
  // Startup message goes to stdout so that stderr in e2e-captured logs is
  // reserved for real errors (proxy failures, crashes). stdout is ignored
  // in the fixture, so this is effectively silent in practice.
  process.stdout.write(
    `Static frontend listening on http://localhost:${port} (proxying /api -> 127.0.0.1:${backendPort})\n`,
  );
});
