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

import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { loadAppConfig, updateAutoUpdateLastChecked } from '../../shared_code/utils/appConfigUtils';
import { loadResourcesConfig } from '../../shared_code/utils/resourcesConfigUtils';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available'
  | 'downloading' | 'downloaded' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  downloadProgress?: number;
  errorMessage?: string;
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);
  const len = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < len; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export class UpdateManager {
  private state: UpdateState;
  private isDev: boolean;
  private getMainWindow: () => BrowserWindow | null;
  private autoCheckInterval: ReturnType<typeof setInterval> | null = null;
  private downloadedDmgPath: string | null = null;

  constructor(isDev: boolean, getMainWindow: () => BrowserWindow | null) {
    this.isDev = isDev;
    this.getMainWindow = getMainWindow;
    this.state = {
      status: 'idle',
      currentVersion: app.getVersion(),
    };
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  private sendStatusToRenderer(): void {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', this.getState());
    }
  }

  /**
   * Resolve the base URL for the auto-update server, or null when the user
   * hasn't configured one. A null result means auto-update is disabled —
   * the menu item is hidden, the auto-check timer doesn't start, and any
   * direct call no-ops gracefully.
   */
  private getBaseUrlOrNull(): string | null {
    const resources = loadResourcesConfig();
    const dnsName = resources.appUpdateDNSName;
    if (!dnsName) return null;
    return `https://${dnsName}/app`;
  }

  isConfigured(): boolean {
    return this.getBaseUrlOrNull() !== null;
  }

  async checkForUpdate(): Promise<void> {
    if (this.state.status === 'checking') return;

    const baseUrl = this.getBaseUrlOrNull();
    if (!baseUrl) return;

    this.state = {
      ...this.state,
      status: 'checking',
      errorMessage: undefined,
    };
    this.sendStatusToRenderer();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const versionResponse = await fetch(
        `${baseUrl}/metadata/auto-update-version.txt`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!versionResponse.ok) {
        throw new Error(`Failed to check for updates (HTTP ${versionResponse.status})`);
      }

      const latestVersion = (await versionResponse.text()).trim();

      // Update last checked timestamp
      updateAutoUpdateLastChecked(new Date().toISOString());

      if (isNewerVersion(latestVersion, this.state.currentVersion)) {
        // Fetch release notes
        let releaseNotes: string | undefined;
        try {
          const notesController = new AbortController();
          const notesTimeout = setTimeout(() => notesController.abort(), 10000);
          const notesResponse = await fetch(
            `${baseUrl}/release_notes/${latestVersion}.md`,
            { signal: notesController.signal }
          );
          clearTimeout(notesTimeout);
          if (notesResponse.ok) {
            releaseNotes = await notesResponse.text();
          }
        } catch {
          // Release notes are optional
        }

        this.state = {
          ...this.state,
          status: 'available',
          latestVersion,
          releaseNotes,
        };
      } else {
        this.state = {
          ...this.state,
          status: 'not-available',
          latestVersion,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.state = {
        ...this.state,
        status: 'error',
        errorMessage: message.includes('abort')
          ? 'Update check timed out. Please check your internet connection.'
          : `Failed to check for updates: ${message}`,
      };
    }

    this.sendStatusToRenderer();
  }

  async downloadUpdate(): Promise<void> {
    if (this.state.status !== 'available' || !this.state.latestVersion) return;

    const baseUrl = this.getBaseUrlOrNull();
    if (!baseUrl) return;

    this.state = {
      ...this.state,
      status: 'downloading',
      downloadProgress: 0,
    };
    this.sendStatusToRenderer();

    try {
      const version = this.state.latestVersion;
      const dmgUrl = `${baseUrl}/dist/Meadow-${version}-prod-arm64.dmg`;

      const response = await fetch(dmgUrl);
      if (!response.ok) {
        throw new Error(`Download failed (HTTP ${response.status})`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      const dmgPath = path.join(os.tmpdir(), `Meadow-${version}.dmg`);
      const fileStream = fs.createWriteStream(dmgPath);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to read download stream');

      let receivedBytes = 0;
      let lastProgressUpdate = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(Buffer.from(value));
        receivedBytes += value.length;

        if (totalBytes > 0) {
          const progress = Math.round((receivedBytes / totalBytes) * 100);
          // Throttle progress updates to avoid flooding IPC
          const now = Date.now();
          if (progress !== lastProgressUpdate && now - lastProgressUpdate > 200) {
            lastProgressUpdate = now;
            this.state = { ...this.state, downloadProgress: progress };
            this.sendStatusToRenderer();
          }
        }
      }

      await new Promise<void>((resolve, reject) => {
        fileStream.end(() => resolve());
        fileStream.on('error', reject);
      });

      this.downloadedDmgPath = dmgPath;
      this.state = {
        ...this.state,
        status: 'downloaded',
        downloadProgress: 100,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.state = {
        ...this.state,
        status: 'error',
        errorMessage: `Download failed: ${message}`,
        downloadProgress: undefined,
      };
    }

    this.sendStatusToRenderer();
  }

  async installUpdate(): Promise<void> {
    if (this.isDev) {
      this.state = {
        ...this.state,
        status: 'error',
        errorMessage: 'Cannot install updates in development mode.',
      };
      this.sendStatusToRenderer();
      return;
    }

    if (this.state.status !== 'downloaded' || !this.downloadedDmgPath) return;

    // Detect read-only volume (app running from mounted DMG)
    const appPath = this.getAppPath();
    try {
      fs.accessSync(path.dirname(appPath), fs.constants.W_OK);
    } catch {
      this.state = {
        ...this.state,
        status: 'error',
        errorMessage: 'Cannot update: the application appears to be running from a read-only volume (e.g., a DMG). Please copy Meadow to your Applications folder first.',
      };
      this.sendStatusToRenderer();
      return;
    }

    // Write the updater script to a temp file
    const scriptPath = path.join(os.tmpdir(), 'meadow-updater.sh');
    const updaterScript = `#!/bin/bash
APP_PID=$1; APP_PATH="$2"; DMG_PATH="$3"
# Wait for process to exit (max 30s)
for i in $(seq 1 60); do
  kill -0 "$APP_PID" 2>/dev/null || break; sleep 0.5
done
# Mount, copy, unmount, launch
MOUNT_POINT=$(mktemp -d)
hdiutil attach "$DMG_PATH" -nobrowse -noverify -mountpoint "$MOUNT_POINT"
NEW_APP=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" | head -1)
rm -rf "$APP_PATH"
cp -R "$NEW_APP" "$APP_PATH"
xattr -rd com.apple.quarantine "$APP_PATH"
hdiutil detach "$MOUNT_POINT" -quiet
rm -f "$DMG_PATH"
open "$APP_PATH"
`;

    fs.writeFileSync(scriptPath, updaterScript, { mode: 0o755 });

    const pid = process.pid.toString();
    spawn('bash', [scriptPath, pid, appPath, this.downloadedDmgPath], {
      detached: true,
      stdio: 'ignore',
    }).unref();

    app.quit();
  }

  startAutoCheckTimer(): void {
    if (this.isDev) return;
    if (!this.isConfigured()) return;

    const config = loadAppConfig();
    if (config.appAutoUpdateCheckEnabled === false) return;

    const intervalSecs = config.appAutoUpdateCheckIntervalSecs || 86400;
    const lastChecked = config.appAutoUpdateCheckLastChecked;

    // Check if due now
    if (lastChecked) {
      const elapsed = (Date.now() - new Date(lastChecked).getTime()) / 1000;
      if (elapsed >= intervalSecs) {
        this.autoCheckAndNotify();
      }
    } else {
      // Never checked before
      this.autoCheckAndNotify();
    }

    // Set up periodic check
    this.autoCheckInterval = setInterval(() => {
      this.autoCheckAndNotify();
    }, intervalSecs * 1000);
  }

  stopAutoCheckTimer(): void {
    if (this.autoCheckInterval) {
      clearInterval(this.autoCheckInterval);
      this.autoCheckInterval = null;
    }
  }

  private async autoCheckAndNotify(): Promise<void> {
    await this.checkForUpdate();
    if (this.state.status === 'available') {
      const win = this.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('open-update-modal');
      }
    }
  }

  private getAppPath(): string {
    // process.execPath is like /Applications/Meadow.app/Contents/MacOS/Meadow
    // We need to go up 3 levels to get /Applications/Meadow.app
    return path.resolve(process.execPath, '..', '..', '..');
  }
}
