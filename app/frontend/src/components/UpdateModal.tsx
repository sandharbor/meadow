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

import React, { useEffect, useState } from 'react';
import Modal from './Modal';

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  downloadProgress?: number;
  errorMessage?: string;
}

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ isOpen, onClose }) => {
  const [state, setState] = useState<UpdateState | null>(null);

  useEffect(() => {
    if (!isOpen || !window.electronAPI) return;

    // Get initial state
    window.electronAPI.getUpdateState().then((s) => {
      const updateState = s as unknown as UpdateState;
      setState(updateState);
      // If idle/not-available/error, trigger a fresh check (menu-click case)
      if (updateState.status === 'idle' || updateState.status === 'not-available' || updateState.status === 'error') {
        window.electronAPI.checkForUpdate();
      }
    });

    // Listen for live updates
    window.electronAPI.onUpdateStatus((s) => {
      setState(s as unknown as UpdateState);
    });

    return () => {
      window.electronAPI.offUpdateStatus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const renderContent = () => {
    if (!state || state.status === 'checking') {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Checking for updates...</p>
        </div>
      );
    }

    if (state.status === 'not-available') {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="text-green-600 text-4xl mb-4">&#10003;</div>
          <p className="text-gray-800 font-medium">You&apos;re up to date!</p>
          <p className="text-gray-500 text-sm mt-2">Meadow v{state.currentVersion} is the latest version.</p>
        </div>
      );
    }

    if (state.status === 'available') {
      return (
        <div className="py-4">
          <p className="text-gray-800 font-medium mb-2">
            Meadow v{state.latestVersion} is available
          </p>
          <p className="text-gray-500 text-sm mb-4">You are currently on v{state.currentVersion}.</p>

          {state.releaseNotes && (
            <div className="mb-4">
              <p className="text-gray-700 text-sm font-medium mb-1">Release Notes:</p>
              <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {state.releaseNotes}
              </pre>
            </div>
          )}

          <button
            onClick={() => window.electronAPI.downloadUpdate()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
          >
            Download
          </button>
        </div>
      );
    }

    if (state.status === 'downloading') {
      const progress = state.downloadProgress ?? 0;
      return (
        <div className="flex flex-col items-center py-8">
          <p className="text-gray-600 mb-4">Downloading update...</p>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-gray-500 text-sm">{progress}%</p>
        </div>
      );
    }

    if (state.status === 'downloaded') {
      return (
        <div className="flex flex-col items-center py-8">
          <div className="text-green-600 text-4xl mb-4">&#10003;</div>
          <p className="text-gray-800 font-medium mb-2">Update downloaded!</p>
          <p className="text-gray-500 text-sm mb-4 text-center">
            Meadow will quit and relaunch with the new version.
          </p>
          <button
            onClick={() => window.electronAPI.installUpdate()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
          >
            Restart to Update
          </button>
        </div>
      );
    }

    if (state.status === 'error') {
      return (
        <div className="flex flex-col items-center py-8">
          <div className="text-red-500 text-4xl mb-4">!</div>
          <p className="text-gray-800 font-medium mb-2">Update Error</p>
          <p className="text-gray-500 text-sm mb-4 text-center">{state.errorMessage}</p>
          <button
            onClick={() => window.electronAPI.checkForUpdate()}
            className="w-full bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Software Update"
      className="w-[480px]"
    >
      {renderContent()}
    </Modal>
  );
};

export default UpdateModal;
