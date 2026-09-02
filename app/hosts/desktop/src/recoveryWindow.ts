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
import * as fs from 'fs';
import * as path from 'path';
import type { StartupFailureDiagnostic } from '../../../contracts/types/startupRecovery';
import {
  selectMeadowHomeForRecovery,
  startupSupportDiagnosticText,
} from '../../../shared_code/utils/startupRecovery';
import { DESKTOP_WEB_SECURITY_PREFERENCES } from '../../../shared_code/utils/desktopLaunchSecurity';
import { renderStartupRecoveryHtml } from '../../../shared_code/utils/startupRecoveryHtml';
import {
  createBrowserLaunchUrl,
  postRuntimeControl,
  waitForRuntimeHomeRelease,
} from '../../../runtime/supervisor/src/runtimeClient';
import { getRuntimePaths } from '../../../runtime/supervisor/src/runtimePaths';
import { readRuntimeSessionDescriptor } from '../../../runtime/supervisor/src/sessionDescriptor';
import {
  logRuntimeOwnership,
  type RuntimeOwnershipLogContext,
} from '../../../runtime/supervisor/src/runtimeOwnershipLog';

export interface RecoveryWindowOptions {
  diagnostic: StartupFailureDiagnostic;
}

function relaunch(): void {
  app.relaunch();
  app.exit(0);
}

function readExpectedRuntime(diagnostic: StartupFailureDiagnostic) {
  const blocker = diagnostic.runtimeBlocker;
  if (!blocker?.sessionAvailable) return null;
  const descriptorPath = getRuntimePaths(diagnostic.selectedHomePath).sessionDescriptor;
  if (!fs.existsSync(descriptorPath)) return null;
  const descriptor = readRuntimeSessionDescriptor(descriptorPath);
  return descriptor.instanceId === blocker.instanceId ? descriptor : null;
}

export function showRecoveryWindow(options: RecoveryWindowOptions): BrowserWindow {
  const blocker = options.diagnostic.runtimeBlocker;
  const ownershipLog: RuntimeOwnershipLogContext | null = blocker ? {
    homeDirectory: options.diagnostic.selectedHomePath,
    traceId: blocker.ownershipTraceId ?? `recovery-${blocker.instanceId}`,
    source: 'Meadow Desktop Recovery',
    instanceId: blocker.instanceId,
  } : null;
  if (ownershipLog) {
    logRuntimeOwnership(ownershipLog, 'recovery-screen-presented', {
      category: options.diagnostic.category,
      supervisorPid: blocker!.supervisorPid,
      clientLeases: blocker!.clientLeases,
      browserSessions: blocker!.browserSessions,
      operationLeases: blocker!.operationLeases,
      sessionAvailable: blocker!.sessionAvailable,
    });
  }
  const recoveryWindow = new BrowserWindow({
    width: 780,
    height: 680,
    minWidth: 640,
    minHeight: 560,
    title: 'Meadow',
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
    if (ownershipLog) {
      logRuntimeOwnership(ownershipLog, 'recovery-action-selected', { action });
    }
    const complete = (result: { ok: boolean; message: string }) => {
      if (ownershipLog) {
        logRuntimeOwnership(ownershipLog, 'recovery-action-completed', {
          action,
          outcome: result.ok ? 'accepted' : 'not-completed',
        });
      }
      return result;
    };
    try {
      if (action === 'copy') {
        clipboard.writeText(diagnosticText);
        return complete({ ok: true, message: 'Redacted diagnostic copied.' });
      }
      if (action === 'reveal') {
        const target = options.diagnostic.relevantPath
          ?? options.diagnostic.checkpointPath
          ?? options.diagnostic.selectedHomePath;
        if (fs.existsSync(target)) shell.showItemInFolder(target);
        else shell.showItemInFolder(path.dirname(target));
        return complete({ ok: true, message: 'Revealed the relevant location in Finder.' });
      }
      if (action === 'choose-home') {
        const selected = await dialog.showOpenDialog(recoveryWindow, {
          title: 'Choose a Meadow Home',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (selected.canceled || selected.filePaths.length !== 1) {
          return complete({ ok: true, message: 'No Home was selected.' });
        }
        const result = selectMeadowHomeForRecovery(
          options.diagnostic.bootstrapPath,
          selected.filePaths[0],
        );
        const preservation = result.preservedInvalidBootstrapPath
          ? ' The invalid bootstrap file was preserved beside the replacement.'
          : '';
        setImmediate(relaunch);
        return complete({ ok: true, message: `Selected ${result.selectedHomePath}.${preservation}` });
      }
      if (action === 'open-active') {
        const descriptor = readExpectedRuntime(options.diagnostic);
        if (!descriptor) {
          return complete({ ok: false, message: 'That Meadow session has changed. Try opening the app again.' });
        }
        const launchUrl = await createBrowserLaunchUrl(descriptor, '/', {
          ownershipTraceId: ownershipLog?.traceId,
          source: 'Meadow Desktop Recovery',
          userAction: 'chose Return to browser',
        });
        await shell.openExternal(launchUrl);
        setImmediate(() => app.exit(0));
        return complete({ ok: true, message: 'Opening the active Meadow session in your browser…' });
      }
      if (action === 'take-over') {
        const descriptor = readExpectedRuntime(options.diagnostic);
        if (!descriptor) {
          return complete({ ok: false, message: 'That Meadow session has changed. Try opening the app again.' });
        }
        const shutdown = await postRuntimeControl(descriptor, '/shutdown', {
          force: true,
          ownershipTraceId: ownershipLog?.traceId,
          clientName: 'Meadow Desktop Recovery',
          userAction: 'chose Open here instead',
        });
        if (!shutdown.response.ok || shutdown.body.success !== true) {
          return complete({ ok: false, message: 'The other Meadow session could not be stopped. Your Home is unchanged.' });
        }
        await waitForRuntimeHomeRelease(descriptor, {
          ownershipTraceId: ownershipLog?.traceId,
          source: 'Meadow Desktop Recovery',
          userAction: 'chose Open here instead',
        });
        setImmediate(relaunch);
        return complete({ ok: true, message: 'Opening this Home in the app…' });
      }
      if (action === 'retry') {
        setImmediate(relaunch);
        return complete({ ok: true, message: 'Restarting Meadow…' });
      }
      if (action === 'quit') {
        setImmediate(() => app.exit(0));
        return complete({ ok: true, message: 'Quitting Meadow…' });
      }
      throw new Error('Unknown recovery action');
    } catch (error) {
      if (ownershipLog) {
        logRuntimeOwnership(ownershipLog, 'recovery-action-failed', {
          action,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  });

  recoveryWindow.once('ready-to-show', () => recoveryWindow.show());
  recoveryWindow.on('closed', () => ipcMain.removeHandler('startup-recovery-action'));
  void recoveryWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(renderStartupRecoveryHtml(options.diagnostic))}`);
  return recoveryWindow;
}
