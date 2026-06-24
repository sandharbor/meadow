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

export {};

declare global {
  interface Window {
    electronAPI: {
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      getBackendPort: () => Promise<number>;
      getFrontendPort: () => Promise<number>;
      getTargetPageInfo: () => Promise<{
        vaultPath: string;
        folderPath: string;
        pageName: string;
      } | null>;
      showOpenDialog: (options: {
        title?: string;
        defaultPath?: string;
        buttonLabel?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory'>;
      }) => Promise<{
        canceled: boolean;
        filePaths: string[];
      }>;
      showSaveDialog: (options: {
        title?: string;
        defaultPath?: string;
        buttonLabel?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<{
        canceled: boolean;
        filePath?: string;
      }>;
      openExternal: (url: string) => Promise<void>;
      openPath: (path: string) => Promise<string>;
      checkForUpdate: () => Promise<void>;
      downloadUpdate: () => Promise<void>;
      installUpdate: () => Promise<void>;
      getAppVersion: () => Promise<string>;
      getUpdateState: () => Promise<Record<string, unknown>>;
      onUpdateStatus: (callback: (state: Record<string, unknown>) => void) => void;
      offUpdateStatus: () => void;
      onOpenUpdateModal: (callback: () => void) => void;
      offOpenUpdateModal: () => void;
    };
  }
}
