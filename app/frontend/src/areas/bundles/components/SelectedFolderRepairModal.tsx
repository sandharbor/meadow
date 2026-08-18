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
import Modal from '../../../shared/components/Modal';
import { apiRequest } from '../../../shared/utils/apiClient';

export interface MissingSelectedFolder {
  bundleNodeId: string;
  bundleNodeName: string;
  sourceGraphSubdirectory: string;
  role: 'entry' | 'collectionMember';
  reason: 'missing' | 'notDirectory' | 'symlinkOrEscape';
}

interface RelinkPreflight {
  fingerprint: string;
  bundleNodeId: string;
  oldLocator: string;
  oldName: string;
  newLocator: string;
  newName: string;
  preservedBundleNodeId: string;
  collectionMemberIndex?: number;
  remainingMissingSelectedFolders: MissingSelectedFolder[];
  prediction?: {
    supportedSeedFileCount: number;
    predictedRawNodeCount: number;
    predictedTypedEdgeCount: number;
    sensitiveNodeCount: number;
    skippedPathCount: number;
    highImpactWarning: boolean;
  };
}

interface SelectedFolderRepairModalProps {
  isOpen: boolean;
  bundleSlug: string;
  sourceDirectory: string;
  missingFolders: MissingSelectedFolder[];
  onClose: () => void;
  onSuccess: () => void;
}

const SelectedFolderRepairModal: React.FC<SelectedFolderRepairModalProps> = ({
  isOpen,
  bundleSlug,
  sourceDirectory,
  missingFolders,
  onClose,
  onSuccess,
}) => {
  const [targetId, setTargetId] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [preflight, setPreflight] = useState<RelinkPreflight | null>(null);
  const [confirmHighImpact, setConfirmHighImpact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTargetId(missingFolders[0]?.bundleNodeId ?? '');
    setSelectedFolder('');
    setPreflight(null);
    setConfirmHighImpact(false);
    setError(null);
  }, [isOpen, missingFolders]);

  const target = missingFolders.find(folder => folder.bundleNodeId === targetId);

  const browse = async () => {
    const result = await window.electronAPI?.showOpenDialog({
      properties: ['openDirectory'],
      title: `Relink ${target?.bundleNodeName ?? 'selected folder'}`,
      defaultPath: sourceDirectory,
    });
    if (!result || result.canceled || result.filePaths.length === 0) return;
    setSelectedFolder(result.filePaths[0]);
    setPreflight(null);
    setConfirmHighImpact(false);
    setError(null);
  };

  const review = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await apiRequest(`bundles/${encodeURIComponent(bundleSlug)}/folders/relink-preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleNodeId: targetId, selectedFolder }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Selected-folder relink preflight failed');
      setPreflight(result as RelinkPreflight);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preflight) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiRequest(`bundles/${encodeURIComponent(bundleSlug)}/folders/relink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundleNodeId: targetId,
          selectedFolder,
          fingerprint: preflight.fingerprint,
          confirmHighImpact,
        }),
      });
      const result = await response.json();
      if (response.status === 409 && result.preflight) {
        setPreflight(result.preflight as RelinkPreflight);
        throw new Error(result.error);
      }
      if (!response.ok) throw new Error(result.error || 'Failed to relink selected folder');
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Relink selected folder" className="w-full max-w-2xl h-auto">
      <div className="space-y-4 p-1">
        <p className="text-sm text-neutral-700">
          Meadow cannot open this bundle until every selected folder is repaired. Choose an existing folder beneath
          <span className="font-mono"> {sourceDirectory}</span>. Meadow preserves the folder identity, bundle-home order, and role references.
        </p>
        {missingFolders.length > 1 && (
          <label className="block text-sm font-medium text-neutral-700">
            Missing selected folder
            <select
              value={targetId}
              onChange={event => { setTargetId(event.target.value); setPreflight(null); setSelectedFolder(''); }}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            >
              {missingFolders.map(folder => (
                <option key={folder.bundleNodeId} value={folder.bundleNodeId}>{folder.sourceGraphSubdirectory || '(source root)'}</option>
              ))}
            </select>
          </label>
        )}
        {target && (
          <div className="rounded border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">
            Missing {target.role === 'entry' ? 'entry folder' : 'bundle-home folder'}: <span className="font-mono">{target.sourceGraphSubdirectory || '(source root)'}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input readOnly value={selectedFolder} placeholder="Choose the replacement folder" className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2 text-sm" />
          <button type="button" onClick={() => void browse()} className="rounded border border-neutral-300 px-3 py-2 text-sm">Choose folder</button>
          <button type="button" onClick={() => void review()} disabled={!selectedFolder || busy} className="rounded bg-main-600 px-3 py-2 text-sm text-white disabled:opacity-40">Review</button>
        </div>
        {preflight && (
          <div className="rounded border border-main-200 bg-main-50 p-3 text-sm text-neutral-800">
            <p><span className="font-mono">{preflight.oldLocator || '(source root)'}</span> → <span className="font-mono">{preflight.newLocator || '(source root)'}</span></p>
            <p className="mt-1 text-xs">Stable ID {preflight.preservedBundleNodeId}{preflight.collectionMemberIndex !== undefined ? ` · bundle-home position ${preflight.collectionMemberIndex + 1}` : ''}</p>
            {preflight.prediction && (
              <p className="mt-2">{preflight.prediction.supportedSeedFileCount} seeds · {preflight.prediction.predictedRawNodeCount} raw nodes · {preflight.prediction.predictedTypedEdgeCount} typed edges · {preflight.prediction.skippedPathCount} skipped paths</p>
            )}
            {preflight.remainingMissingSelectedFolders.length > 0 && (
              <p className="mt-2 text-warning-800">{preflight.remainingMissingSelectedFolders.length} other selected folder(s) will still require repair.</p>
            )}
            {preflight.prediction?.highImpactWarning && (
              <label className="mt-3 flex items-start gap-2 text-warning-900">
                <input type="checkbox" checked={confirmHighImpact} onChange={event => setConfirmHighImpact(event.target.checked)} />
                I reviewed the high-impact graph prediction.
              </label>
            )}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
          <button type="button" onClick={onClose} disabled={busy} className="rounded border border-neutral-300 px-4 py-2 text-sm">Cancel</button>
          <button
            type="button"
            onClick={() => void commit()}
            disabled={!preflight || busy || (preflight.prediction?.highImpactWarning === true && !confirmHighImpact)}
            className="rounded bg-main-600 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {busy ? 'Working…' : 'Relink folder'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SelectedFolderRepairModal;
