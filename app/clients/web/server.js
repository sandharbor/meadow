import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = fs.existsSync(path.join(__dirname, 'index.html'))
  ? __dirname
  : path.join(__dirname, 'dist');
const port = Number.parseInt(process.env.PORT || '3000', 10);
const backendPort = Number.parseInt(process.env.VITE_BACKEND_PORT || '', 10);
const apiCapability = process.env.MEADOW_API_CAPABILITY;
const runtimeControlUrl = process.env.MEADOW_RUNTIME_CONTROL_URL;
const browserSessionCookie = 'meadow_browser_session';

if (!backendPort || !apiCapability || !runtimeControlUrl) {
  throw new Error('Runtime Supervisor browser environment is required');
}

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function readCookie(cookieHeader, name) {
  for (const item of cookieHeader?.split(';') ?? []) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function control(pathname, body) {
  return fetch(`${runtimeControlUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-meadow-capability': apiCapability,
    },
    body: JSON.stringify(body),
  });
}

function send(response, status, body, headers = {}) {
  const contents = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  response.writeHead(status, {
    'content-length': contents.byteLength,
    ...headers,
  });
  response.end(contents);
}

async function exchangeLaunchToken(requestUrl, response) {
  const launchToken = requestUrl.searchParams.get('meadowLaunchToken');
  if (!launchToken) return false;
  try {
    const exchange = await control('/browser-session/exchange', { token: launchToken });
    if (!exchange.ok) {
      send(response, 403, 'Browser launch token is invalid or expired');
      return true;
    }
    const session = await exchange.json();
    response.writeHead(303, {
      'set-cookie': `${browserSessionCookie}=${encodeURIComponent(session.sessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${session.maxAgeSeconds}`,
      'cache-control': 'no-store',
      location: session.targetPath,
    });
    response.end();
  } catch {
    send(response, 503, 'Runtime browser session is unavailable');
  }
  return true;
}

async function proxyApi(request, response) {
  const sessionId = readCookie(request.headers.cookie, browserSessionCookie);
  if (!sessionId) {
    send(response, 401, 'Browser session is required');
    return;
  }
  try {
    const validation = await control('/browser-session/validate', { sessionId });
    if (!validation.ok) {
      send(response, 401, 'Browser session is required');
      return;
    }
    const proxyRequest = http.request({
      host: '127.0.0.1',
      port: backendPort,
      method: request.method,
      path: request.url,
      agent: false,
      headers: {
        ...request.headers,
        host: `127.0.0.1:${backendPort}`,
        'x-meadow-capability': apiCapability,
      },
    }, proxyResponse => {
      response.writeHead(proxyResponse.statusCode || 500, proxyResponse.headers);
      proxyResponse.pipe(response);
    });
    proxyRequest.on('error', () => {
      if (!response.headersSent) send(response, 502, 'Bad Gateway');
      else response.end();
    });
    request.pipe(proxyRequest);
  } catch {
    send(response, 503, 'Runtime browser session is unavailable');
  }
}

function staticFilePath(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    return null;
  }
  const candidate = path.resolve(distPath, `.${pathname}`);
  if (candidate !== distPath && !candidate.startsWith(`${distPath}${path.sep}`)) return null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  return path.join(distPath, 'index.html');
}

const server = http.createServer((request, response) => {
  void (async () => {
    const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${port}`);
    if (await exchangeLaunchToken(requestUrl, response)) return;
    if (requestUrl.pathname.startsWith('/api/')) {
      await proxyApi(request, response);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, 405, 'Method Not Allowed', { allow: 'GET, HEAD' });
      return;
    }
    const filePath = staticFilePath(requestUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      send(response, 404, 'Frontend build not found');
      return;
    }
    const contents = fs.readFileSync(filePath);
    const headers = {
      'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
    };
    if (request.method === 'HEAD') send(response, 200, Buffer.alloc(0), headers);
    else send(response, 200, contents, headers);
  })().catch(() => {
    if (!response.headersSent) send(response, 500, 'Internal Server Error');
    else response.end();
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Frontend server running on IPv4 loopback port ${port}`);
});
