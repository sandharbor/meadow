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

import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import type { StartupFailureDiagnostic } from '../../shared_code/types/startupRecovery';
import {
  selectMeadowHomeForRecovery,
  startupSupportDiagnosticText,
} from '../../shared_code/utils/startupRecovery';
import { DESKTOP_WEB_SECURITY_PREFERENCES } from '../../shared_code/utils/desktopLaunchSecurity';
import { renderStartupRecoveryHtml } from '../../shared_code/utils/startupRecoveryHtml';

const execFileAsync = promisify(execFile);

export interface RecoveryWindowOptions {
  diagnostic: StartupFailureDiagnostic;
  isDev: boolean;
  nodePath: string;
  resourcesPath: string;
}

async function restoreCheckpoint(options: RecoveryWindowOptions): Promise<void> {
  const { diagnostic } = options;
  if (!diagnostic.checkpointAvailable || !diagnostic.checkpointId) {
    throw new Error('No verified migration checkpoint is available');
  }
  const confirmation = await dialog.showMessageBox({
    type: 'warning',
    title: 'Restore Meadow Home checkpoint?',
    message: 'Restore the verified pre-migration checkpoint?',
    detail: 'Meadow will first preserve the current Home in the external recovery directory. Publishing destinations are not contacted.',
    buttons: ['Cancel', 'Restore checkpoint'],
    defaultId: 0,
    cancelId: 0,
  });
  if (confirmation.response !== 1) return;

  let executable: string;
  let args: string[];
  if (options.isDev) {
    executable = path.resolve(__dirname, '../../../../backend/node_modules/.bin/tsx');
    args = [
      path.resolve(__dirname, '../../../../backend/src/shared/recovery/restoreCheckpoint.ts'),
      diagnostic.selectedHomePath,
      diagnostic.checkpointId,
      diagnostic.appVersion,
    ];
  } else {
    executable = options.nodePath;
    args = [
      path.join(options.resourcesPath, 'backend', 'src', 'shared', 'recovery', 'restoreCheckpoint.js'),
      diagnostic.selectedHomePath,
      diagnostic.checkpointId,
      diagnostic.appVersion,
    ];
  }
  await execFileAsync(executable, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 120_000,
  });
}

function relaunch(): void {
  app.relaunch();
  app.exit(0);
}

export function showRecoveryWindow(options: RecoveryWindowOptions): BrowserWindow {
  const recoveryWindow = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 720,
    minHeight: 600,
    title: 'Meadow Safe Startup Recovery',
    show: false,
    webPreferences: {
      ...DESKTOP_WEB_SECURITY_PREFERENCES,
      sandbox: true,
      preload: path.join(__dirname, 'recoveryPreload.js'),
    },
  });
  recoveryWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  recoveryWindow.webContents.on('will-navigate', event => event.preventDefault());
  const diagnosticText = startupSupportDiagnosticText(options.diagnostic);

  ipcMain.removeHandler('startup-recovery-action');
  ipcMain.handle('startup-recovery-action', async (event, action: unknown) => {
    if (event.sender !== recoveryWindow.webContents || typeof action !== 'string') {
      throw new Error('Untrusted recovery action');
    }
    if (action === 'copy') {
      clipboard.writeText(diagnosticText);
      return { ok: true, message: 'Redacted diagnostic copied.' };
    }
    if (action === 'reveal') {
      const target = options.diagnostic.relevantPath
        ?? options.diagnostic.checkpointPath
        ?? options.diagnostic.selectedHomePath;
      if (fs.existsSync(target)) shell.showItemInFolder(target);
      else shell.showItemInFolder(path.dirname(target));
      return { ok: true, message: 'Revealed the relevant location in Finder.' };
    }
    if (action === 'choose-home') {
      const selected = await dialog.showOpenDialog(recoveryWindow, {
        title: 'Choose a Meadow Home',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (selected.canceled || selected.filePaths.length !== 1) {
        return { ok: true, message: 'No Home was selected.' };
      }
      const result = selectMeadowHomeForRecovery(
        options.diagnostic.bootstrapPath,
        selected.filePaths[0],
      );
      const preservation = result.preservedInvalidBootstrapPath
        ? ' The invalid bootstrap file was preserved beside the replacement.'
        : '';
      setImmediate(relaunch);
      return { ok: true, message: `Selected ${result.selectedHomePath}.${preservation}` };
    }
    if (action === 'restore') {
      await restoreCheckpoint(options);
      setImmediate(relaunch);
      return { ok: true, message: 'Checkpoint restored. Restarting Meadow…' };
    }
    if (action === 'retry') {
      setImmediate(relaunch);
      return { ok: true, message: 'Restarting Meadow…' };
    }
    if (action === 'quit') {
      setImmediate(() => app.exit(0));
      return { ok: true, message: 'Quitting Meadow…' };
    }
    throw new Error('Unknown recovery action');
  });

  recoveryWindow.once('ready-to-show', () => recoveryWindow.show());
  recoveryWindow.on('closed', () => ipcMain.removeHandler('startup-recovery-action'));
  void recoveryWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(renderStartupRecoveryHtml(options.diagnostic))}`);
  return recoveryWindow;
}
