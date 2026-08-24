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

import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { loadAppConfig, updateAutoUpdateLastChecked } from '../../../shared_code/utils/appConfigUtils';
import { loadResourcesConfig } from '../../../shared_code/utils/resourcesConfigUtils';
import { compareAppVersions } from '../../../shared_code/utils/meadowHomeFormat';
import {
  downloadVerifiedUpdateArtifact,
  fetchVerifiedUpdateMetadata,
  type VerifiedDownload,
  type VerifiedMetadata,
} from './verifiedUpdater';

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

export function isNewerVersion(latest: string, current: string): boolean {
  return compareAppVersions(latest, current) > 0;
}

function writeHelperConfiguration(filePath: string, value: unknown): void {
  const descriptor = fs.openSync(filePath, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.chmodSync(filePath, 0o600);
}

function removeTransaction(transactionDirectory: string | undefined): void {
  if (!transactionDirectory) return;
  fs.rmSync(transactionDirectory, { recursive: true, force: true });
}

export class UpdateManager {
  private state: UpdateState;
  private readonly isDev: boolean;
  private readonly getMainWindow: () => BrowserWindow | null;
  private autoCheckInterval: ReturnType<typeof setInterval> | null = null;
  private verifiedMetadata: VerifiedMetadata | null = null;
  private verifiedDownload: VerifiedDownload | null = null;

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

    removeTransaction(
      this.verifiedDownload?.transactionDirectory
        ?? this.verifiedMetadata?.transactionDirectory,
    );
    this.verifiedDownload = null;
    this.verifiedMetadata = null;
    this.state = { ...this.state, status: 'checking', errorMessage: undefined };
    this.sendStatusToRenderer();

    try {
      const verifiedMetadata = await fetchVerifiedUpdateMetadata(baseUrl);
      this.verifiedMetadata = verifiedMetadata;
      const { metadata } = verifiedMetadata;
      updateAutoUpdateLastChecked(new Date().toISOString());

      if (isNewerVersion(metadata.version, this.state.currentVersion)) {
        let releaseNotes: string | undefined;
        try {
          const notesUrl = new URL(
            metadata.releaseNotesPath,
            `${baseUrl.replace(/\/?$/, '/')}`,
          );
          const response = await fetch(notesUrl, { redirect: 'error' });
          if (response.ok) {
            const declaredLength = Number(response.headers.get('content-length') ?? 0);
            if (declaredLength <= 512 * 1024) {
              const candidate = await response.text();
              if (Buffer.byteLength(candidate) <= 512 * 1024) releaseNotes = candidate;
            }
          }
        } catch {
          // Release notes are optional and are not part of the update authority.
        }
        this.state = {
          ...this.state,
          status: 'available',
          latestVersion: metadata.version,
          releaseNotes,
        };
      } else {
        removeTransaction(verifiedMetadata.transactionDirectory);
        this.verifiedMetadata = null;
        this.state = {
          ...this.state,
          status: 'not-available',
          latestVersion: metadata.version,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.state = {
        ...this.state,
        status: 'error',
        errorMessage: `Failed to check for updates: ${message}`,
      };
    }
    this.sendStatusToRenderer();
  }

  async downloadUpdate(): Promise<void> {
    if (this.state.status !== 'available' || !this.verifiedMetadata) return;
    const baseUrl = this.getBaseUrlOrNull();
    if (!baseUrl) return;

    this.state = { ...this.state, status: 'downloading', downloadProgress: 0 };
    this.sendStatusToRenderer();
    try {
      this.verifiedDownload = await downloadVerifiedUpdateArtifact(
        baseUrl,
        this.verifiedMetadata,
      );
      this.verifiedMetadata = null;
      this.state = {
        ...this.state,
        status: 'downloaded',
        downloadProgress: 100,
      };
    } catch (error) {
      this.verifiedMetadata = null;
      this.verifiedDownload = null;
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
    if (this.state.status !== 'downloaded' || !this.verifiedDownload) return;

    const installedAppPath = this.getAppPath();
    try {
      fs.accessSync(path.dirname(installedAppPath), fs.constants.W_OK);
    } catch {
      this.state = {
        ...this.state,
        status: 'error',
        errorMessage: 'Cannot update from a read-only volume. Copy Meadow to Applications first.',
      };
      this.sendStatusToRenderer();
      return;
    }

    const healthToken = randomBytes(32).toString('hex');
    const helperConfigurationPath = path.join(
      this.verifiedDownload.transactionDirectory,
      'helper-configuration.json',
    );
    const helperLogPath = path.join(
      this.verifiedDownload.transactionDirectory,
      'update-failure.log',
    );
    const helperPath = path.join(__dirname, 'updateHelper.js');
    try {
      const helperStat = fs.lstatSync(helperPath);
      if (!helperStat.isFile() || helperStat.isSymbolicLink()) {
        throw new Error('Packaged update helper is not a regular file');
      }
      writeHelperConfiguration(helperConfigurationPath, {
        installedAppPath,
        artifactPath: this.verifiedDownload.artifactPath,
        transactionDirectory: this.verifiedDownload.transactionDirectory,
        metadata: this.verifiedDownload.metadata,
        healthToken,
        originalPid: process.pid,
      });
      const logDescriptor = fs.openSync(helperLogPath, 'wx', 0o600);
      const helper = spawn(process.execPath, [helperPath, helperConfigurationPath], {
        detached: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', logDescriptor, logDescriptor],
      });
      try {
        await new Promise<void>((resolve, reject) => {
          helper.once('spawn', resolve);
          helper.once('error', reject);
        });
      } finally {
        fs.closeSync(logDescriptor);
      }
      helper.unref();
      app.quit();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.state = {
        ...this.state,
        status: 'error',
        errorMessage: `Failed to start verified update: ${message}`,
      };
      this.sendStatusToRenderer();
    }
  }

  startAutoCheckTimer(): void {
    if (this.isDev || !this.isConfigured()) return;
    const config = loadAppConfig();
    if (config.appAutoUpdateCheckEnabled === false) return;
    const intervalSecs = config.appAutoUpdateCheckIntervalSecs || 86400;
    const lastChecked = config.appAutoUpdateCheckLastChecked;
    if (!lastChecked
      || (Date.now() - new Date(lastChecked).getTime()) / 1000 >= intervalSecs) {
      void this.autoCheckAndNotify();
    }
    this.autoCheckInterval = setInterval(() => {
      void this.autoCheckAndNotify();
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
    return path.resolve(process.execPath, '..', '..', '..');
  }
}
