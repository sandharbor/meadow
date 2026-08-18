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
import {
  allocateDesktopPorts,
  createLaunchCapability,
  DESKTOP_WEB_SECURITY_PREFERENCES,
  isTrustedDesktopRenderer,
} from '../../../../shared_code/utils/desktopLaunchSecurity.js';

describe('desktop launch security', () => {
  it('generates at least 256 bits of per-launch capability material', () => {
    const first = createLaunchCapability();
    const second = createLaunchCapability();
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    expect(Buffer.from(second, 'base64url')).toHaveLength(32);
    expect(second).not.toBe(first);
  });

  it('uses explicit development ports but dynamically allocates distinct production ports', async () => {
    await expect(allocateDesktopPorts(true, { backendPort: 3101, frontendPort: 3100 }, async () => 0))
      .resolves.toEqual({ backendPort: 3101, frontendPort: 3100 });

    const candidates = [44000, 44000, 44001];
    await expect(allocateDesktopPorts(false, {}, async () => candidates.shift()!))
      .resolves.toEqual({ backendPort: 44000, frontendPort: 44001 });
  });

  it('locks down BrowserWindow preferences and accepts only the exact UI origin', () => {
    expect(DESKTOP_WEB_SECURITY_PREFERENCES).toEqual({
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    });
    expect(isTrustedDesktopRenderer('http://127.0.0.1:3200/bundle/example', 3200)).toBe(true);
    expect(isTrustedDesktopRenderer('http://localhost:3200/', 3200)).toBe(false);
    expect(isTrustedDesktopRenderer('https://attacker.example/', 3200)).toBe(false);
  });
});
