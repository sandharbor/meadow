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

import { createHmac, timingSafeEqual } from 'crypto';
import type { RequestHandler } from 'express';
import { MEADOW_CONTROL_PROTOCOL } from '../../../../shared_code/utils/localRuntimeSession.js';

export const MEADOW_CAPABILITY_HEADER = 'x-meadow-capability';
export { MEADOW_CONTROL_PROTOCOL };
export const MEADOW_PREVIEW_TOKEN_QUERY = 'meadowPreviewToken';
const MEADOW_PREVIEW_COOKIE = 'meadow-preview-v1';

export interface ControlPlaneSecurityOptions {
  capability: string;
  allowedOrigin: string;
}

function capabilitiesMatch(expected: string, supplied: string | undefined): boolean {
  if (!supplied) return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  if (expectedBytes.length !== suppliedBytes.length) return false;
  return timingSafeEqual(expectedBytes, suppliedBytes);
}

export function createPreviewReadToken(capability: string, bundleSlug: string): string {
  return createHmac('sha256', capability)
    .update(`meadow-preview-read-v1\0${bundleSlug}`)
    .digest('hex');
}

function previewBundleSlug(req: Parameters<RequestHandler>[0]): string | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const pathname = new URL(req.originalUrl, 'http://127.0.0.1').pathname;
  const match = /^\/api\/bundles\/([^/]+)\/generation\/published\//.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function cookieValue(source: string | undefined, name: string): string | undefined {
  if (!source) return undefined;
  for (const pair of source.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return undefined;
}

/**
 * Protect every route mounted after this middleware. Health is deliberately
 * mounted before it and exposes only a readiness bit and protocol identifier.
 */
export function createControlPlaneSecurity(
  options: ControlPlaneSecurityOptions,
): RequestHandler {
  const { capability, allowedOrigin } = options;
  if (!capability || !allowedOrigin) {
    throw new Error('Local control-plane capability and UI origin are required');
  }

  return (req, res, next) => {
    const origin = req.get('origin');
    if (origin) {
      res.setHeader('Vary', 'Origin');
      if (origin !== allowedOrigin) {
        res.status(403).json({ error: 'Origin not allowed' });
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    }

    if (req.method === 'OPTIONS') {
      if (!origin) {
        res.status(400).json({ error: 'Origin required for preflight' });
        return;
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', `Content-Type, ${MEADOW_CAPABILITY_HEADER}`);
      res.setHeader('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }

    // Generated preview files are intentionally iframe/browser-readable, but
    // a browser navigation cannot attach the general API header. Exchange a
    // bundle-scoped, read-only HMAC once for an HttpOnly cookie, then redirect
    // to a clean URL so neither the token nor the launch capability enters
    // referrers, generated HTML, or logs. The cookie path confines it to one
    // bundle's published-preview tree and never authorizes mutations.
    const previewSlug = previewBundleSlug(req);
    if (previewSlug) {
      const expectedPreviewToken = createPreviewReadToken(capability, previewSlug);
      const requestUrl = new URL(req.originalUrl, 'http://127.0.0.1');
      const queryToken = requestUrl.searchParams.get(MEADOW_PREVIEW_TOKEN_QUERY) ?? undefined;
      if (capabilitiesMatch(expectedPreviewToken, queryToken)) {
        const cookiePath = `/api/bundles/${encodeURIComponent(previewSlug)}/generation/published/`;
        res.setHeader('Set-Cookie', [
          `${MEADOW_PREVIEW_COOKIE}=${expectedPreviewToken}`,
          `Path=${cookiePath}`,
          'HttpOnly',
          'SameSite=Strict',
          'Max-Age=3600',
        ].join('; '));
        requestUrl.searchParams.delete(MEADOW_PREVIEW_TOKEN_QUERY);
        res.redirect(302, `${requestUrl.pathname}${requestUrl.search}`);
        return;
      }

      const cookieToken = cookieValue(req.get('cookie'), MEADOW_PREVIEW_COOKIE);
      if (capabilitiesMatch(expectedPreviewToken, cookieToken)) {
        next();
        return;
      }
    }

    const supplied = req.get(MEADOW_CAPABILITY_HEADER);
    if (!capabilitiesMatch(capability, supplied)) {
      // Never include the supplied or expected capability in a response or log.
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  };
}
