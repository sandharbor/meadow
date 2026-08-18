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

import { logger } from './logger';

const CAPABILITY_HEADER = 'x-meadow-capability';
const nativeFetch = globalThis.fetch.bind(globalThis);

let apiCapability: string | null = null;
let interceptorInstalled = false;
let isElectronMode = false;

// Browser development and E2E use a same-origin /api proxy. Electron gets a
// per-launch loopback URL and capability through the context-isolated preload.
export let API_BASE_URL = '/api';

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = input instanceof Request ? input.url : input.toString();
    return new URL(raw, window.location.origin);
  } catch {
    return null;
  }
}

function isBackendApiRequest(input: RequestInfo | URL): boolean {
  const candidate = requestUrl(input);
  if (!candidate) return false;
  const apiRoot = new URL(API_BASE_URL, window.location.origin);
  return candidate.origin === apiRoot.origin
    && (candidate.pathname === apiRoot.pathname || candidate.pathname.startsWith(`${apiRoot.pathname}/`));
}

/** Shared API transport. It never places the launch capability in a URL. */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (!apiCapability || !isBackendApiRequest(input)) {
    return nativeFetch(input, init);
  }

  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  headers.set(CAPABILITY_HEADER, apiCapability);

  if (input instanceof Request) {
    return nativeFetch(new Request(input, { ...init, headers }));
  }
  return nativeFetch(input, { ...init, headers });
}

function installFetchInterceptor(): void {
  if (interceptorInstalled) return;
  interceptorInstalled = true;
  // Existing UI modules call fetch directly. Installing the shared transport
  // before React renders centralizes authentication without exposing a raw
  // capability to each component.
  globalThis.fetch = apiFetch;
}

export async function initializeApiConfig(): Promise<void> {
  if (typeof window !== 'undefined' && window.electronAPI) {
    isElectronMode = true;
    const connection = await window.electronAPI.getBackendConnection();
    const parsed = new URL(connection.baseUrl);
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/api') {
      throw new Error('Electron returned an invalid backend connection');
    }
    if (!connection.capability) {
      throw new Error('Electron returned an incomplete backend connection');
    }
    API_BASE_URL = parsed.toString().replace(/\/$/, '');
    apiCapability = connection.capability;
    logger.debug('Authenticated loopback API transport initialized');
  } else {
    isElectronMode = false;
    API_BASE_URL = '/api';
    apiCapability = null;
    logger.debug('Same-origin API proxy transport initialized');
  }
  installFetchInterceptor();
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function updateApiBaseUrl(): Promise<void> {
  await initializeApiConfig();
}

/**
 * Minimal authenticated SSE client. Native EventSource cannot attach the
 * capability header, and putting the capability in its URL would leak it.
 */
export class AuthenticatedEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private readonly abortController = new AbortController();
  private closed = false;

  constructor(private readonly url: string) {
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
      const response = await apiFetch(this.url, {
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

export function isAuthenticatedElectronTransport(): boolean {
  return isElectronMode && apiCapability !== null;
}
