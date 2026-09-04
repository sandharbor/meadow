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
import Modal from '../../../../shared/components/Modal';
import { apiRequest } from '../../../../shared/utils/apiClient';

type InitialState = 'open' | 'closed';
type BundleInitialState = InitialState | 'inherit';

interface Props {
  bundleSlug: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const FolderNavigationSettingsModal: React.FC<Props> = ({ bundleSlug, onClose, onSaved }) => {
  const [globalDefault, setGlobalDefault] = useState<InitialState>('open');
  const [bundleDefault, setBundleDefault] = useState<BundleInitialState>('inherit');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [globalResponse, bundleResponse] = await Promise.all([
          apiRequest('app-config'),
          apiRequest(`bundles/${bundleSlug}/config`),
        ]);
        if (!globalResponse.ok || !bundleResponse.ok) throw new Error('Could not load folder navigation settings.');
        const [globalConfig, bundleConfig] = await Promise.all([globalResponse.json(), bundleResponse.json()]);
        if (cancelled) return;
        setGlobalDefault(globalConfig.generationFolderNavigationDefaultOpen === false ? 'closed' : 'open');
        setBundleDefault(typeof bundleConfig.generationFolderNavigationDefaultOpen === 'boolean'
          ? bundleConfig.generationFolderNavigationDefaultOpen ? 'open' : 'closed'
          : 'inherit');
        setLoaded(true);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load folder navigation settings.');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [bundleSlug]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const globalResponse = await apiRequest('generation/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationFolderNavigationDefaultOpen: globalDefault === 'open' }),
      });
      if (!globalResponse.ok) throw new Error('Could not save the global default.');
      const bundleResponse = await apiRequest(`bundles/${bundleSlug}/generation/options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationFolderNavigationDefaultOpen: bundleDefault === 'inherit' ? null : bundleDefault === 'open' }),
      });
      if (!bundleResponse.ok) throw new Error('Could not save the bundle default.');
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save folder navigation settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={() => { if (!saving) onClose(); }} title="Folder Navigation Settings" className="w-full max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          Choose how folder navigation appears for first-time visitors. Once a visitor opens or closes it,
          their choice is remembered separately for each bundle.
        </p>
        <label className="block text-sm text-neutral-700">
          Global default
          <select aria-label="Global folder navigation default" value={globalDefault}
            onChange={event => setGlobalDefault(event.target.value as InitialState)} disabled={!loaded || saving}
            className="mt-1 block w-full rounded border border-neutral-300 bg-white px-3 py-2">
            <option value="open">Default open</option>
            <option value="closed">Default closed</option>
          </select>
        </label>
        <label className="block text-sm text-neutral-700">
          This bundle
          <select aria-label="Bundle folder navigation default" value={bundleDefault}
            onChange={event => setBundleDefault(event.target.value as BundleInitialState)} disabled={!loaded || saving}
            className="mt-1 block w-full rounded border border-neutral-300 bg-white px-3 py-2">
            <option value="inherit">Use global (default {globalDefault})</option>
            <option value="open">Default open</option>
            <option value="closed">Default closed</option>
          </select>
        </label>
        {!loaded && !error && <p className="text-sm text-neutral-500">Loading settings...</p>}
        {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={!loaded || saving}
            className="rounded bg-btn-confirm-normal px-3 py-1.5 text-sm text-btn-confirm-text hover:bg-btn-confirm-hover disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default FolderNavigationSettingsModal;
