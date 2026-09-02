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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startBrowserSessionHeartbeat } from '../../src/shared/app-shell/browserSessionHeartbeat';

describe('browser session heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window.crypto, 'randomUUID', {
      configurable: true,
      value: () => 'browser-page-a',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('heartbeats while open and sends a close signal before pausing', async () => {
    const fetchMock = vi.spyOn(window, 'fetch').mockResolvedValue(
      new globalThis.Response(null, { status: 204 }),
    );
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    const cleanup = startBrowserSessionHeartbeat();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledWith(
      '/__meadow/browser-session/heartbeat?pageId=browser-page-a',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );

    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new window.Event('pagehide'));
    expect(sendBeacon).toHaveBeenCalledWith(
      '/__meadow/browser-session/closing?pageId=browser-page-a',
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new window.Event('pageshow'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    cleanup();
  });
});
