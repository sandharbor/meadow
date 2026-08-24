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

import {
  API_BASE_URL,
  apiFetch,
} from './apiConfig';
import { logger } from './logger';

export { API_BASE_URL } from './apiConfig';

const apiLogger = logger.child('api');
const responseRequests = new WeakMap<Response, { method: string; path: string }>();

export interface ApiRequestInit extends RequestInit {
  /** Serialize this value as JSON and set the content type automatically. */
  json?: unknown;
}

interface ApiErrorBody {
  error?: unknown;
  message?: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly method: string,
    readonly path: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Build a URL relative to Meadow's configured backend API root. */
export function apiUrl(path: string): string {
  const apiRoot = API_BASE_URL.replace(/\/$/, '');
  if (/^https?:\/\//i.test(path) || path === apiRoot || path.startsWith(`${apiRoot}/`)) {
    return path;
  }
  return `${apiRoot}/${path.replace(/^\/+/, '')}`;
}

function resolveInput(input: RequestInfo | URL): RequestInfo | URL {
  return typeof input === 'string' ? apiUrl(input) : input;
}

function isBackendApiRequest(input: RequestInfo | URL): boolean {
  try {
    const raw = input instanceof Request ? input.url : input.toString();
    const candidate = new URL(raw, window.location.origin);
    const apiRoot = new URL(API_BASE_URL, window.location.origin);
    return candidate.origin === apiRoot.origin
      && (candidate.pathname === apiRoot.pathname || candidate.pathname.startsWith(`${apiRoot.pathname}/`));
  } catch {
    return false;
  }
}

function requestMethod(input: RequestInfo | URL, init: RequestInit): string {
  return (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

function requestPath(input: RequestInfo | URL): string {
  try {
    const raw = input instanceof Request ? input.url : input.toString();
    return new URL(raw, window.location.origin).pathname;
  } catch {
    return '<invalid-url>';
  }
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

async function sendRequest(
  input: RequestInfo | URL,
  init: RequestInit,
  kind: 'api' | 'resource',
): Promise<Response> {
  const method = requestMethod(input, init);
  const path = requestPath(input);
  const startedAt = performance.now();

  try {
    const response = await apiFetch(input, init);
    responseRequests.set(response, { method, path });
    const summary = `${kind} ${method} ${path} -> ${response.status} (${elapsedMilliseconds(startedAt)}ms)`;
    // apiRequest preserves fetch semantics, so non-2xx responses may be
    // expected and handled by the caller. Record transport outcomes without
    // deciding their application-level severity here.
    apiLogger.debug(summary);
    return response;
  } catch (error) {
    // Navigation and effect cleanup routinely abort in-flight requests. The
    // caller decides whether a transport failure is user-visible or actionable.
    apiLogger.debug(`${kind} ${method} ${path} failed (${elapsedMilliseconds(startedAt)}ms)`, error);
    throw error;
  }
}

/**
 * Send a non-API JavaScript request without API URL or authentication policy.
 * Backend URLs are rejected so callers cannot accidentally choose the raw path.
 */
export function resourceRequest(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  if (isBackendApiRequest(input)) {
    throw new TypeError('Backend requests must use apiRequest');
  }
  return sendRequest(input, init, 'resource');
}

/**
 * Send a backend API request through Meadow's authenticated transport.
 *
 * Paths are relative to the configured API root. This deliberately preserves
 * fetch's HTTP semantics: 4xx and 5xx responses are returned to callers that
 * need status-specific handling. Use apiJson() or requireApiSuccess() when any
 * non-success response should become an ApiError.
 */
export function apiRequest(
  input: RequestInfo | URL,
  init: ApiRequestInit = {},
): Promise<Response> {
  const resolvedInput = resolveInput(input);
  if (!isBackendApiRequest(resolvedInput)) {
    throw new TypeError('Non-API requests must use resourceRequest');
  }
  const { json, ...requestInit } = init;
  if (json !== undefined && requestInit.body !== undefined) {
    throw new TypeError('API requests cannot specify both json and body');
  }

  const headers = new Headers(resolvedInput instanceof Request ? resolvedInput.headers : undefined);
  new Headers(requestInit.headers).forEach((value, key) => headers.set(key, value));
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  let body = requestInit.body;
  if (json !== undefined) {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }

  return sendRequest(resolvedInput, { ...requestInit, headers, body }, 'api');
}

async function readErrorDetails(response: Response): Promise<unknown> {
  try {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) return await response.clone().json();
    const text = await response.clone().text();
    return text ? text.slice(0, 1_000) : undefined;
  } catch {
    return undefined;
  }
}

function errorMessage(details: unknown, fallback: string): string {
  if (!details || typeof details !== 'object') return fallback;
  const body = details as ApiErrorBody;
  if (typeof body.error === 'string' && body.error) return body.error;
  if (typeof body.message === 'string' && body.message) return body.message;
  return fallback;
}

/** Throw a normalized ApiError when a response is not successful. */
export async function requireApiSuccess(response: Response): Promise<Response> {
  if (response.ok) return response;

  const details = await readErrorDetails(response);
  const request = responseRequests.get(response);
  const method = request?.method ?? 'GET';
  const path = request?.path ?? requestPath(response.url);
  const fallback = `API request failed (${response.status} ${response.statusText})`;
  throw new ApiError(
    errorMessage(details, fallback),
    response.status,
    response.statusText,
    method,
    path,
    details,
  );
}

/** Send an API request, require success, and parse its JSON response. */
export async function apiJson<T>(
  input: RequestInfo | URL,
  init: ApiRequestInit = {},
): Promise<T> {
  const response = await requireApiSuccess(await apiRequest(input, init));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** API-relative authenticated stream for application callers. */
export class AuthenticatedEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private readonly abortController = new AbortController();
  private closed = false;

  constructor(private readonly path: string) {
    void this.connect();
  }

  close(): void {
    this.closed = true;
    this.abortController.abort();
  }

  private emitBufferedEvents(buffer: string, flush: boolean): string {
    const normalized = buffer.replace(/\r\n/g, '\n');
    const blocks = normalized.split('\n\n');
    const remainder = flush ? '' : (blocks.pop() ?? '');

    for (const block of blocks) {
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data && !this.closed) {
        this.onmessage?.(new MessageEvent('message', { data }));
      }
    }
    return remainder;
  }

  private async connect(): Promise<void> {
    try {
      const response = await apiRequest(this.path, {
        headers: { Accept: 'text/event-stream' },
        signal: this.abortController.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Event stream rejected (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = this.emitBufferedEvents(buffer, false);
      }
      buffer += decoder.decode();
      this.emitBufferedEvents(`${buffer}\n\n`, true);
      if (!this.closed) this.onerror?.(new Event('error'));
    } catch (error) {
      if (!this.closed && !(error instanceof DOMException && error.name === 'AbortError')) {
        this.onerror?.(new Event('error'));
      }
    }
  }
}
