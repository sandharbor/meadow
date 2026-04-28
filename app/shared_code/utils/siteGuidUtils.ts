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

/**
 * Site GUID utilities
 *
 * Requirements:
 * - Exactly 7 characters
 * - Lowercase letters + numbers
 * - Internal only (not user-facing)
 */
const SITE_GUID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function isValidSiteGuid(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]{7}$/.test(value);
}

export function generateSiteGuid(): string {
  // Simple random ID is sufficient for internal correlation/filtering.
  // (Uses Math.random to remain usable in both Node + browser contexts.)
  let result = '';
  for (let i = 0; i < 7; i++) {
    result += SITE_GUID_CHARS.charAt(Math.floor(Math.random() * SITE_GUID_CHARS.length));
  }
  return result;
}


