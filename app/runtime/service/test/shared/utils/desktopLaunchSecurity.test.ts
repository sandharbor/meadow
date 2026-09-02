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
  DESKTOP_WEB_SECURITY_PREFERENCES,
  isTrustedDesktopRenderer,
  parseAllowedExternalUrl,
} from '../../../../../shared_code/utils/desktopLaunchSecurity.js';

describe('desktop launch security', () => {
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

  it('allows web URLs and path-opening Obsidian URLs while rejecting other protocols and actions', () => {
    expect(parseAllowedExternalUrl('https://example.test/page').toString())
      .toBe('https://example.test/page');
    expect(parseAllowedExternalUrl('obsidian://open?path=%2Fnotes%2FExample.md').toString())
      .toBe('obsidian://open?path=%2Fnotes%2FExample.md');

    expect(() => parseAllowedExternalUrl('file:///Users/example/private.txt')).toThrow();
    expect(() => parseAllowedExternalUrl('obsidian://new?name=Unexpected')).toThrow();
    expect(() => parseAllowedExternalUrl('obsidian://open')).toThrow();
  });
});
