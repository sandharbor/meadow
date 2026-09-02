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

import type { heartbeat, ParticipatesIn } from '../../../../../concepts/index.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_PATH = '/__meadow/browser-session/heartbeat';
const CLOSING_PATH = '/__meadow/browser-session/closing';

function sessionUrl(pathname: string, pageId: string): string {
  const url = new URL(pathname, window.location.origin);
  url.searchParams.set('pageId', pageId);
  return `${url.pathname}${url.search}`;
}

export function startBrowserSessionHeartbeat(): () => void {
  if (window.electronAPI) return () => {};

  const pageId = window.crypto.randomUUID();
  const heartbeatUrl = sessionUrl(HEARTBEAT_PATH, pageId);
  const closingUrl = sessionUrl(CLOSING_PATH, pageId);
  let stopped = false;
  let permanentlyStopped = false;
  let intervalId: number | null = null;

  const pause = () => {
    stopped = true;
    if (intervalId !== null) window.clearInterval(intervalId);
    intervalId = null;
  };

  const heartbeat = async () => {
    if (stopped) return;
    try {
      const response = await window.fetch(heartbeatUrl, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        keepalive: true,
      });
      if (response.status === 401) {
        permanentlyStopped = true;
        pause();
      }
    } catch {
      // A transient miss is harmless. The next heartbeat retries, while the
      // Supervisor TTL handles a browser crash or a permanently lost client.
    }
  };

  const start = () => {
    if (permanentlyStopped || !stopped) return;
    stopped = false;
    void heartbeat();
    intervalId = window.setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);
  };

  const onPageHide = () => {
    pause();
    window.navigator.sendBeacon(closingUrl);
  };
  const onPageShow = () => {
    start();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void heartbeat();
  };

  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', onVisibilityChange);

  stopped = true;
  start();

  return () => {
    permanentlyStopped = true;
    pause();
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

export type BrowserHeartbeatMeadowConceptParticipations = [
  ParticipatesIn<typeof heartbeat, 'emit-page-liveness', typeof startBrowserSessionHeartbeat>,
];
