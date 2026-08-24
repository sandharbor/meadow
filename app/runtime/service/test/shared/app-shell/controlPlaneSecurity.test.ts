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

import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createControlPlaneSecurity,
  createPreviewReadToken,
  MEADOW_CAPABILITY_HEADER,
  MEADOW_CONTROL_PROTOCOL,
  MEADOW_PREVIEW_TOKEN_QUERY,
} from '../../../src/shared/app-shell/controlPlaneSecurity.js';

const CAPABILITY = 'test-only-'.padEnd(54, 'c');
const UI_ORIGIN = 'http://127.0.0.1:43123';

function buildApp() {
  const app = express();
  app.get('/api/health', (_req, res) => {
    res.json({ ready: true, protocol: MEADOW_CONTROL_PROTOCOL });
  });
  app.use('/api', createControlPlaneSecurity({
    capability: CAPABILITY,
    allowedOrigin: UI_ORIGIN,
  }));
  app.get('/api/private', (_req, res) => res.json({ value: 'private' }));
  app.post('/api/private', express.json(), (_req, res) => res.status(204).end());
  app.get('/api/bundles/:slug/generation/published/*', (req, res) => {
    res.type('html').send(`<title>${req.params.slug} preview</title>`);
  });
  return app;
}

describe('local control-plane security', () => {
  it('leaves only the minimal health response unauthenticated', async () => {
    const response = await request(buildApp()).get('/api/health').expect(200);
    expect(response.body).toEqual({ ready: true, protocol: MEADOW_CONTROL_PROTOCOL });
  });

  it.each([
    ['missing', undefined],
    ['wrong', 'not-the-current-launch-capability'],
    ['prior-launch', 'test-only-prior-launch-capability'],
  ])('rejects a %s capability without reflecting it', async (_label, capability) => {
    const call = request(buildApp()).get('/api/private');
    if (capability) call.set(MEADOW_CAPABILITY_HEADER, capability);
    const response = await call.expect(401);
    expect(JSON.stringify(response.body)).not.toContain(capability ?? CAPABILITY);
  });

  it('accepts authenticated trusted-process calls without an Origin header', async () => {
    await request(buildApp())
      .get('/api/private')
      .set(MEADOW_CAPABILITY_HEADER, CAPABILITY)
      .expect(200, { value: 'private' });
  });

  it('accepts only the exact configured browser origin', async () => {
    const app = buildApp();
    await request(app)
      .get('/api/private')
      .set('Origin', UI_ORIGIN)
      .set(MEADOW_CAPABILITY_HEADER, CAPABILITY)
      .expect('Access-Control-Allow-Origin', UI_ORIGIN)
      .expect(200);

    await request(app)
      .get('/api/private')
      .set('Origin', 'http://localhost:43123')
      .set(MEADOW_CAPABILITY_HEADER, CAPABILITY)
      .expect(403, { error: 'Origin not allowed' });
  });

  it('permits preflight only for the exact configured origin', async () => {
    const app = buildApp();
    await request(app)
      .options('/api/private')
      .set('Origin', UI_ORIGIN)
      .set('Access-Control-Request-Headers', MEADOW_CAPABILITY_HEADER)
      .expect(204)
      .expect('Access-Control-Allow-Origin', UI_ORIGIN);

    await request(app)
      .options('/api/private')
      .set('Origin', 'https://attacker.example')
      .expect(403);
  });

  it('requires the capability for mutations too', async () => {
    await request(buildApp()).post('/api/private').send({ mutate: true }).expect(401);
  });

  it('exchanges a bundle-scoped preview token for a clean HttpOnly read cookie', async () => {
    const app = buildApp();
    const token = createPreviewReadToken(CAPABILITY, 'example bundle');
    const initial = await request(app)
      .get(`/api/bundles/example%20bundle/generation/published/index.html?${MEADOW_PREVIEW_TOKEN_QUERY}=${token}`)
      .expect(302);
    expect(initial.headers.location).toBe('/api/bundles/example%20bundle/generation/published/index.html');
    expect(initial.headers.location).not.toContain(token);
    const cookie = initial.headers['set-cookie']?.[0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/bundles/example%20bundle/generation/published/');

    await request(app)
      .get(initial.headers.location)
      .set('Cookie', cookie)
      .expect(200, '<title>example bundle preview</title>');
    await request(app)
      .get('/api/bundles/another/generation/published/index.html')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('never lets the preview token authorize mutations or a disallowed browser origin', async () => {
    const token = createPreviewReadToken(CAPABILITY, 'example');
    const url = `/api/bundles/example/generation/published/index.html?${MEADOW_PREVIEW_TOKEN_QUERY}=${token}`;
    await request(buildApp()).post(url).expect(401);
    await request(buildApp()).get(url).set('Origin', 'https://attacker.example').expect(403);
  });
});
