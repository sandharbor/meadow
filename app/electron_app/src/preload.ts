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

import { contextBridge, ipcRenderer, OpenDialogOptions, SaveDialogOptions } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getBackendPort: () => ipcRenderer.invoke('get-backend-port'),
  getFrontendPort: () => ipcRenderer.invoke('get-frontend-port'),
  getTargetPageInfo: () => ipcRenderer.invoke('get-target-page-info'),

  showOpenDialog: (options: OpenDialogOptions) =>
    ipcRenderer.invoke('show-open-dialog', options),

  showSaveDialog: (options: SaveDialogOptions) =>
    ipcRenderer.invoke('show-save-dialog', options),

  openExternal: (url: string) =>
    ipcRenderer.invoke('open-external', url),

  openPath: (path: string) =>
    ipcRenderer.invoke('open-path', path),

  // Update-related methods
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),

  onUpdateStatus: (callback: (state: any) => void) => {
    ipcRenderer.on('update-status', (_event, state) => callback(state));
  },
  offUpdateStatus: () => {
    ipcRenderer.removeAllListeners('update-status');
  },

  onOpenUpdateModal: (callback: () => void) => {
    ipcRenderer.on('open-update-modal', () => callback());
  },
  offOpenUpdateModal: () => {
    ipcRenderer.removeAllListeners('open-update-modal');
  },
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getBackendPort: () => Promise<number>;
      getFrontendPort: () => Promise<number>;
      getTargetPageInfo: () => Promise<{
        vaultPath: string;
        folderPath: string;
        pageName: string;
      } | null>;
      showOpenDialog: (options: OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
      showSaveDialog: (options: SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
      openExternal: (url: string) => Promise<void>;
      openPath: (path: string) => Promise<string>;
      checkForUpdate: () => Promise<void>;
      downloadUpdate: () => Promise<void>;
      installUpdate: () => Promise<void>;
      getAppVersion: () => Promise<string>;
      getUpdateState: () => Promise<any>;
      onUpdateStatus: (callback: (state: any) => void) => void;
      offUpdateStatus: () => void;
      onOpenUpdateModal: (callback: () => void) => void;
      offOpenUpdateModal: () => void;
    };
  }
}
