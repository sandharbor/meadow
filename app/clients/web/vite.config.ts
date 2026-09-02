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

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const BROWSER_SESSION_COOKIE = 'meadow_browser_session';
const BROWSER_HEARTBEAT_PATH = '/__meadow/browser-session/heartbeat';
const BROWSER_CLOSING_PATH = '/__meadow/browser-session/closing';

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  for (const item of cookieHeader?.split(';') ?? []) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function browserSessionCookieHeader(sessionId: string, maxAgeSeconds: number): string {
  return `${BROWSER_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

async function runtimeControl(
  controlUrl: string,
  capability: string,
  pathname: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return globalThis.fetch(`${controlUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-meadow-capability': capability,
    },
    body: JSON.stringify(body),
  });
}

export default defineConfig(({ command }) => {
  const frontendPort = parseInt(process.env.VITE_FRONTEND_PORT || '0', 10);
  const backendPort = parseInt(process.env.VITE_BACKEND_PORT || '0', 10);
  const apiCapability = process.env.MEADOW_API_CAPABILITY;
  const runtimeControlUrl = process.env.MEADOW_RUNTIME_CONTROL_URL;

  if (command === 'serve' && (!frontendPort || !backendPort)) {
    throw new Error('Runtime Supervisor-provided Vite ports are required.');
  }

  return {
    plugins: [
      {
        name: 'meadow-browser-session',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (!runtimeControlUrl || !apiCapability) {
              next();
              return;
            }
            void (async () => {
              const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${frontendPort}`);
              const launchToken = requestUrl.searchParams.get('meadowLaunchToken');
              if (launchToken) {
                const exchange = await runtimeControl(
                  runtimeControlUrl,
                  apiCapability,
                  '/browser-session/exchange',
                  { token: launchToken },
                );
                if (!exchange.ok) {
                  response.statusCode = 403;
                  response.end('Browser launch token is invalid or expired');
                  return;
                }
                const session = await exchange.json() as {
                  sessionId: string;
                  targetPath: string;
                  maxAgeSeconds: number;
                };
                response.statusCode = 303;
                response.setHeader(
                  'set-cookie',
                  browserSessionCookieHeader(session.sessionId, session.maxAgeSeconds),
                );
                response.setHeader('location', session.targetPath);
                response.setHeader('cache-control', 'no-store');
                response.end();
                return;
              }
              if (
                requestUrl.pathname === BROWSER_HEARTBEAT_PATH
                || requestUrl.pathname === BROWSER_CLOSING_PATH
              ) {
                if (request.method !== 'POST') {
                  response.statusCode = 405;
                  response.setHeader('allow', 'POST');
                  response.end('Method Not Allowed');
                  return;
                }
                const sessionId = readCookie(request.headers.cookie, BROWSER_SESSION_COOKIE);
                const pageId = requestUrl.searchParams.get('pageId');
                if (!sessionId || !pageId) {
                  response.statusCode = 401;
                  response.end('Browser session is required');
                  return;
                }
                const heartbeat = requestUrl.pathname === BROWSER_HEARTBEAT_PATH;
                const lifecycleResponse = await runtimeControl(
                  runtimeControlUrl,
                  apiCapability,
                  heartbeat ? '/browser-session/heartbeat' : '/browser-session/closing',
                  { sessionId, pageId },
                );
                if (!lifecycleResponse.ok) {
                  response.statusCode = 401;
                  response.end('Browser session is no longer active');
                  return;
                }
                response.statusCode = 204;
                response.setHeader('cache-control', 'no-store');
                if (heartbeat) {
                  const result = await lifecycleResponse.json() as { maxAgeSeconds: number };
                  response.setHeader(
                    'set-cookie',
                    browserSessionCookieHeader(sessionId, result.maxAgeSeconds),
                  );
                }
                response.end();
                return;
              }
              if (requestUrl.pathname.startsWith('/api')) {
                const sessionId = readCookie(request.headers.cookie, BROWSER_SESSION_COOKIE);
                const validation = sessionId
                  ? await runtimeControl(
                      runtimeControlUrl,
                      apiCapability,
                      '/browser-session/validate',
                      { sessionId },
                    )
                  : null;
                if (!validation?.ok) {
                  response.statusCode = 401;
                  response.end('Browser session is required');
                  return;
                }
              }
              next();
            })().catch(() => {
              response.statusCode = 503;
              response.end('Runtime browser session is unavailable');
            });
          });
        },
      },
      react(),
    ],
    resolve: {
      alias: {
        // Ensure a single copy of React is used across the app and Web-owned shared components
        'react': path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      host: '127.0.0.1',
      port: frontendPort,
      proxy: {
        '/api': {
          // Use 127.0.0.1 instead of localhost so Node does not run dual-stack
          // connect attempts (internalConnectMultiple), which often stalls ~1–2s on Windows.
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
          ...(apiCapability
            ? {
                headers: {
                  'x-meadow-capability': apiCapability,
                },
              }
            : {}),
        },
      },
    },
  };
});
