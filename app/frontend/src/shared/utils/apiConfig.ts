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

// Centralized API configuration
import { logger } from './logger';

let currentBackendPort = 0;
let isElectronMode = false;

// Function to get the dynamic backend port from Electron API
async function getBackendPort(): Promise<number> {
  // Check if we're running in Electron and have access to the electronAPI
  if (typeof window !== 'undefined' && window.electronAPI) {
    isElectronMode = true;
    logger.debug('Attempting to get backend port from Electron API...');
    const backendPort = await window.electronAPI.getBackendPort();
    if (backendPort) {
      logger.debug('Got backend port from Electron API:', backendPort);
      return backendPort;
    }
    throw new Error('Electron API returned no backend port');
  } else {
    logger.debug('electronAPI not available, using relative URL via proxy');
  }

  // In browser mode, port is unused (relative URLs via Vite proxy)
  return 0;
}

// Function to update the API base URL
export async function updateApiBaseUrl(): Promise<void> {
  currentBackendPort = await getBackendPort();
  logger.debug('Backend port updated to:', currentBackendPort);
}

// Get the current API base URL (always returns the most up-to-date value)
export function getApiBaseUrl(): string {
  // In browser mode (non-Electron), use relative URL so the Vite proxy handles routing
  if (!isElectronMode) {
    logger.debug('Using relative API base URL (browser/proxy mode)');
    return '/api';
  }
  const url = `http://localhost:${currentBackendPort}/api`;
  logger.debug('Current API base URL:', url);
  return url;
}

// Export the API_BASE_URL for backward compatibility
// Note: This will be updated after updateApiBaseUrl() is called
export let API_BASE_URL = '/api';

// Update the exported API_BASE_URL when port changes
export async function initializeApiConfig(): Promise<void> {
  logger.debug('Starting API configuration initialization...');
  await updateApiBaseUrl();
  API_BASE_URL = getApiBaseUrl();
  logger.debug('API_BASE_URL initialized to:', API_BASE_URL);
} 