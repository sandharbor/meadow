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

import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal';
import { apiRequest } from '../utils/apiClient';

interface ProviderPlan {
  providerId: string;
  providerDisplayName: string;
  currentPublishSlug: string;
  currentPublicUrl: string | null;
  predecessorCleanupRevisionCount: number;
}

interface RenamePlan {
  bundleSlug: string;
  hasGeneratedVersion: boolean;
  willCreateGeneratedVersion: boolean;
  providers: ProviderPlan[];
}

interface Decision {
  providerId: string;
  renameAddress: boolean;
  publishSlug: string;
  readerConnectionToPredecessor: 'connected' | 'disconnected';
  predecessorCleanupPolicy: 'keep' | 'delete-after-success';
}

export function normalizeBundleSlugInput(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-');
}

export default function RenameBundleModal({
  isOpen,
  bundleSlug,
  onClose,
  onRenamed,
}: {
  isOpen: boolean;
  bundleSlug: string;
  onClose: () => void;
  onRenamed: (slug: string) => void;
}) {
  const [newSlug, setNewSlug] = useState('');
  const [plan, setPlan] = useState<RenamePlan | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNewSlug('');
    setPlan(null);
    setError(null);
    void apiRequest(`bundles/${encodeURIComponent(bundleSlug)}/rename-plan`)
      .then(async response => {
        if (!response.ok) throw new Error((await response.json()).error || 'Could not inspect this bundle');
        const loaded = await response.json() as RenamePlan;
        setPlan(loaded);
        setDecisions(loaded.providers.map(provider => ({
          providerId: provider.providerId,
          renameAddress: provider.currentPublishSlug === bundleSlug,
          publishSlug: provider.currentPublishSlug,
          readerConnectionToPredecessor: 'connected',
          predecessorCleanupPolicy: 'keep',
        })));
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [isOpen, bundleSlug]);

  const resolvedDecisions = useMemo(() => decisions.map(decision => ({
    ...decision,
    publishSlug: decision.renameAddress ? newSlug : decision.publishSlug,
  })), [decisions, newSlug]);

  const updateDecision = (providerId: string, patch: Partial<Decision>) => {
    setDecisions(current => current.map(decision => decision.providerId === providerId ? { ...decision, ...patch } : decision));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[a-z0-9-]+$/.test(newSlug)) {
      setError('Bundle name must contain only lowercase letters, numbers, and dashes.');
      return;
    }
    setIsRenaming(true);
    setError(null);
    try {
      const response = await apiRequest(`bundles/${encodeURIComponent(bundleSlug)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newSlug,
          providers: resolvedDecisions.map(({ renameAddress: _renameAddress, ...decision }) => decision),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Bundle rename failed');
      onRenamed(body.slug);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rename bundle" className="w-full max-w-xl">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="rename-bundle-slug" className="block text-sm font-medium text-neutral-700 mb-1">New bundle name</label>
          <input
            id="rename-bundle-slug"
            autoFocus
            required
            pattern="[a-z0-9\-]+"
            value={newSlug}
            onChange={event => setNewSlug(normalizeBundleSlugInput(event.target.value))}
            placeholder={bundleSlug}
            className="w-full rounded border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-main-500"
          />
          <p className="mt-1 text-xs text-neutral-500">Uppercase letters become lowercase and spaces become hyphens. This also renames the bundle folder. Its permanent bundle ID does not change.</p>
        </div>

        {plan?.willCreateGeneratedVersion && (
          <p className="rounded bg-main-50 p-3 text-sm text-main-800">
            Because this bundle has been published, Meadow will immediately generate a new unsaved version from tracked content. Review and save it before publishing.
          </p>
        )}
        {plan?.hasGeneratedVersion && !plan.willCreateGeneratedVersion && (
          <p className="rounded bg-neutral-50 p-3 text-sm text-neutral-700">
            The current version will be regenerated immediately from tracked content without changing its version ID.
          </p>
        )}

        {plan?.providers.map(provider => {
          const decision = decisions.find(item => item.providerId === provider.providerId)!;
          const coupled = provider.currentPublishSlug === bundleSlug;
          return (
            <fieldset key={provider.providerId} className="rounded border border-neutral-200 p-4 space-y-3">
              <legend className="px-1 font-medium text-neutral-800">{provider.providerDisplayName}</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={decision.renameAddress}
                  onChange={event => updateDecision(provider.providerId, { renameAddress: event.target.checked })}
                />
                <span>
                  Also rename published address
                  <span className="block text-xs text-neutral-500">
                    {coupled ? 'Recommended because the current published address follows the bundle name.' : `Currently ${provider.currentPublishSlug}; it was customized separately.`}
                  </span>
                </span>
              </label>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <label>
                  <span className="block font-medium text-neutral-700 mb-1">Old readers</span>
                  <select
                    value={decision.readerConnectionToPredecessor}
                    onChange={event => updateDecision(provider.providerId, { readerConnectionToPredecessor: event.target.value as Decision['readerConnectionToPredecessor'] })}
                    className="w-full rounded border border-neutral-300 px-2 py-2"
                  >
                    <option value="connected">Point to the new revision</option>
                    <option value="disconnected">Keep separate</option>
                  </select>
                </label>
                <label>
                  <span className="block font-medium text-neutral-700 mb-1">Existing files</span>
                  <select
                    value={decision.predecessorCleanupPolicy}
                    onChange={event => updateDecision(provider.providerId, { predecessorCleanupPolicy: event.target.value as Decision['predecessorCleanupPolicy'] })}
                    className="w-full rounded border border-neutral-300 px-2 py-2"
                  >
                    <option value="keep">Keep after publishing</option>
                    <option value="delete-after-success">Delete after new publish succeeds</option>
                  </select>
                </label>
              </div>
              {decision.predecessorCleanupPolicy === 'delete-after-success' && (
                <p className="text-xs text-danger-700">
                  After the new revision publishes successfully, {provider.predecessorCleanupRevisionCount} retained publication revision{provider.predecessorCleanupRevisionCount === 1 ? '' : 's'} will be deleted. Nothing is deleted during rename.
                </p>
              )}
            </fieldset>
          );
        })}

        {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isRenaming} className="rounded border border-neutral-300 px-4 py-2 text-neutral-700">Cancel</button>
          <button type="submit" disabled={isRenaming || !plan} className="rounded bg-btn-confirm-normal px-4 py-2 text-btn-confirm-text disabled:opacity-50">
            {isRenaming ? 'Renaming and generating…' : 'Rename bundle'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
