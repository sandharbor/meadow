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

export const DESKTOP_WEB_SECURITY_PREFERENCES = Object.freeze({
  nodeIntegration: false,
  contextIsolation: true,
  webSecurity: true,
});

export function isTrustedDesktopRenderer(url: string, frontendPort: number): boolean {
  try {
    return new globalThis.URL(url).origin === `http://127.0.0.1:${frontendPort}`;
  } catch {
    return false;
  }
}

/**
 * Validates URLs before handing them to the operating system. Obsidian links
 * are intentionally limited to opening an existing path; arbitrary custom
 * protocols and other Obsidian actions remain blocked.
 */
export function parseAllowedExternalUrl(url: string): InstanceType<typeof globalThis.URL> {
  const parsed = new globalThis.URL(url);
  const isWebUrl = parsed.protocol === 'https:' || parsed.protocol === 'http:';
  const isObsidianOpenUrl = parsed.protocol === 'obsidian:'
    && parsed.hostname === 'open'
    && Boolean(parsed.searchParams.get('path'));

  if (!isWebUrl && !isObsidianOpenUrl) {
    throw new Error('Only HTTP(S) links and Obsidian path-open links may be opened externally');
  }
  return parsed;
}
