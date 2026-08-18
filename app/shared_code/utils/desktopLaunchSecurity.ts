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

import { randomBytes } from 'crypto';

export const DESKTOP_WEB_SECURITY_PREFERENCES = Object.freeze({
  nodeIntegration: false,
  contextIsolation: true,
  webSecurity: true,
});

export function createLaunchCapability(): string {
  return randomBytes(32).toString('base64url');
}

export async function allocateDesktopPorts(
  isDevelopment: boolean,
  configured: { backendPort?: number; frontendPort?: number },
  findFreePort: () => Promise<number>,
): Promise<{ backendPort: number; frontendPort: number }> {
  if (isDevelopment) {
    if (!configured.backendPort || !configured.frontendPort) {
      throw new Error('Development backendPort and frontendPort must be configured');
    }
    return { backendPort: configured.backendPort, frontendPort: configured.frontendPort };
  }

  const backendPort = await findFreePort();
  let frontendPort: number;
  do {
    frontendPort = await findFreePort();
  } while (frontendPort === backendPort);
  return { backendPort, frontendPort };
}

export function isTrustedDesktopRenderer(url: string, frontendPort: number): boolean {
  try {
    return new globalThis.URL(url).origin === `http://127.0.0.1:${frontendPort}`;
  } catch {
    return false;
  }
}
