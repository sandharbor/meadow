import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const backendPort = Number.parseInt(process.env.VITE_BACKEND_PORT || '', 10);
const apiCapability = process.env.MEADOW_API_CAPABILITY;
const runtimeControlUrl = process.env.MEADOW_RUNTIME_CONTROL_URL;
const browserSessionCookie = 'meadow_browser_session';

if (!backendPort || !apiCapability || !runtimeControlUrl) {
  throw new Error('Runtime Supervisor browser environment is required');
}

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

app.use((req, res, next) => {
  const launchToken = typeof req.query.meadowLaunchToken === 'string'
    ? req.query.meadowLaunchToken
    : null;
  if (!launchToken) {
    next();
    return;
  }
  void control('/browser-session/exchange', { token: launchToken })
    .then(async exchange => {
      if (!exchange.ok) {
        res.status(403).send('Browser launch token is invalid or expired');
        return;
      }
      const session = await exchange.json();
      res.setHeader(
        'set-cookie',
        `${browserSessionCookie}=${encodeURIComponent(session.sessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${session.maxAgeSeconds}`,
      );
      res.setHeader('cache-control', 'no-store');
      res.redirect(303, session.targetPath);
    })
    .catch(() => res.status(503).send('Runtime browser session is unavailable'));
});

app.use('/api', (req, res) => {
  const sessionId = readCookie(req.headers.cookie, browserSessionCookie);
  if (!sessionId) {
    res.status(401).send('Browser session is required');
    return;
  }
  void control('/browser-session/validate', { sessionId })
    .then(validation => {
      if (!validation.ok) {
        res.status(401).send('Browser session is required');
        return;
      }
      const proxyRequest = http.request({
        host: '127.0.0.1',
        port: backendPort,
        method: req.method,
        path: req.originalUrl,
        agent: false,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${backendPort}`,
          'x-meadow-capability': apiCapability,
        },
      }, proxyResponse => {
        res.writeHead(proxyResponse.statusCode || 500, proxyResponse.headers);
        proxyResponse.pipe(res);
      });
      proxyRequest.on('error', () => {
        if (!res.headersSent) res.status(502).send('Bad Gateway');
        else res.end();
      });
      req.pipe(proxyRequest);
    })
    .catch(() => res.status(503).send('Runtime browser session is unavailable'));
});

// Serve static files from the dist directory
// In production build, dist files are in the same directory as server.js
// In development, dist is a subdirectory
const distPath = fs.existsSync(path.join(__dirname, 'index.html')) 
  ? __dirname 
  : path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Catch all handler - send back index.html for any non-API routes
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error('ERROR: Frontend build not found - index.html does not exist at:', indexPath);
    res.status(404).send('Frontend build not found');
  }
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Frontend server running on IPv4 loopback port ${port}`);
});
