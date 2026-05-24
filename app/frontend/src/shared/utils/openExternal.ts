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

/**
 * Opens a URL in the user's default external browser.
 * Centralizes logging and error handling for all external URL opens.
 */
export async function openExternal(url: string, source: string): Promise<void> {
  logger.debug(`[openExternal] Opening URL from ${source}:`, url);
  try {
    await window.electronAPI?.openExternal(url);
  } catch (err) {
    logger.error(`[openExternal] Failed to open URL from ${source}:`, err);
  }
}
