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

/* global alert, confirm */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../../../shared/utils/apiClient';
import { DisabledTooltip } from '../../../../shared/components/DisabledTooltip';
import { useAppNavigation } from '../../../../shared/utils/appNavigation';
import { casualVersionName, versionCreatedDate } from '../utils/versionLabels';

interface VersionChange {
  status: string;
  relativePath: string;
}

interface VersionView {
  versionId: string;
  createdAt: string;
  notes: string;
  predecessorVersionId: string | null;
  localFilesState: 'present' | 'deleted';
  localFilesDeletedAt?: string;
  displayState: 'current' | 'frozen' | 'unsaved' | 'locally-deleted' | 'integrity-problem';
  savedGenerationId: string | null;
  generatedChanges: VersionChange[];
  integrityChanges: VersionChange[];
}

interface ComparisonChange {
  status: 'added' | 'modified' | 'deleted';
  relativePath: string;
}

const stateLabel: Record<VersionView['displayState'], string> = {
  current: 'Current',
  frozen: 'Frozen',
  unsaved: 'Unsaved',
  'locally-deleted': 'Locally Deleted',
  'integrity-problem': 'Integrity Problem',
};

const stateClassName: Record<VersionView['displayState'], string> = {
  current: 'bg-blue-100 text-blue-700',
  frozen: 'bg-neutral-200 text-neutral-600',
  unsaved: 'bg-amber-100 text-amber-800',
  'locally-deleted': 'bg-neutral-200 text-neutral-500',
  'integrity-problem': 'bg-danger-100 text-danger-700',
};

export function VersionsTab({
  bundleSlug,
  refreshKey,
  onCreateNewVersion,
  createNewVersionDisabled = false,
  onVersionChanged,
}: {
  bundleSlug: string;
  refreshKey: number;
  onCreateNewVersion: () => void;
  createNewVersionDisabled?: boolean;
  onVersionChanged?: () => void;
}) {
  const [versions, setVersions] = useState<VersionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [busyVersionId, setBusyVersionId] = useState<string | null>(null);
  const [leftComparison, setLeftComparison] = useState('');
  const [rightComparison, setRightComparison] = useState('working');
  const [comparison, setComparison] = useState<ComparisonChange[]>([]);
  const [pendingBundleRename, setPendingBundleRename] = useState(false);
  const navigateInApp = useAppNavigation('versionsTab');

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest(`bundles/${bundleSlug}/review/versions`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load versions');
      const nextVersions = (data.versions ?? []) as VersionView[];
      setVersions(nextVersions);
      setPendingBundleRename(data.pendingBundleRename === true);
      const presentSaved = nextVersions.filter(version => version.localFilesState === 'present' && version.savedGenerationId);
      setLeftComparison(current => current || presentSaved.at(-2)?.versionId || presentSaved[0]?.versionId || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  }, [bundleSlug]);

  useEffect(() => { void loadVersions(); }, [loadVersions, refreshKey]);

  const comparisonOptions = useMemo(
    () => versions
      .map((version, manifestIndex) => ({ version, manifestIndex }))
      .filter(({ version }) => version.localFilesState === 'present' && version.savedGenerationId),
    [versions],
  );
  const displayVersions = useMemo(
    () => versions
      .map((version, manifestIndex) => ({ version, manifestIndex }))
      .reverse(),
    [versions],
  );
  const hasNeverSavedCurrentVersion = versions.at(-1)?.displayState === 'unsaved'
    && !versions.at(-1)?.savedGenerationId;
  const createVersionIsDisabled = createNewVersionDisabled || hasNeverSavedCurrentVersion;

  useEffect(() => {
    if (versions.length < 2 || !leftComparison) {
      setComparison([]);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ left: leftComparison, right: rightComparison });
    apiRequest(`bundles/${bundleSlug}/review/version-comparison?${params}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to compare versions');
        setComparison(data.changes ?? []);
      })
      .catch(caught => {
        if ((caught as Error).name !== 'AbortError') setError(caught instanceof Error ? caught.message : 'Failed to compare versions');
      });
    return () => controller.abort();
  }, [bundleSlug, leftComparison, rightComparison, refreshKey, versions.length]);

  const runAction = async (versionId: string, path: string, method: 'POST' | 'DELETE' = 'POST') => {
    setBusyVersionId(versionId);
    setError(null);
    try {
      const response = await apiRequest(path, { method });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Version action failed');
      if (typeof data.slug === 'string' && data.slug !== bundleSlug) {
        navigateInApp({ page: 'bundle', slug: data.slug });
        return;
      }
      await loadVersions();
      onVersionChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Version action failed');
    } finally {
      setBusyVersionId(null);
    }
  };

  const saveNotes = async (versionId: string) => {
    setBusyVersionId(versionId);
    try {
      const response = await apiRequest(`bundles/${bundleSlug}/review/versions/${versionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editingNotes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update note');
      setEditingVersionId(null);
      await loadVersions();
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : 'Failed to update note');
    } finally {
      setBusyVersionId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto pr-2">
      {!loading && versions.length > 1 && <div className="mb-4 flex justify-end">
        <DisabledTooltip
          disabled={createVersionIsDisabled}
          tooltip={hasNeverSavedCurrentVersion ? 'Save or cancel the unsaved version before creating another.' : undefined}
          align="right"
        >
          <button
            onClick={onCreateNewVersion}
            disabled={createVersionIsDisabled}
            className="rounded bg-btn-confirm-normal px-3 py-1 text-sm font-medium text-btn-confirm-text hover:bg-btn-confirm-hover disabled:cursor-not-allowed disabled:opacity-50"
          >Create New Version</button>
        </DisabledTooltip>
      </div>}
      {error && <div className="mb-4 rounded border border-danger-300 bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
      {loading ? (
        <div className="p-6 text-sm text-neutral-500">Loading versions…</div>
      ) : versions.length === 0 ? (
        <div className="rounded border border-neutral-200 p-6 text-sm text-neutral-500">Generate the bundle to create its first version.</div>
      ) : versions.length === 1 ? (
        <section className="mx-auto max-w-2xl rounded-lg border border-blue-200 bg-blue-50/50 p-6">
          <h3 className="text-base font-semibold text-neutral-900">Why create a new version?</h3>
          <p className="mt-3 text-sm leading-6 text-neutral-700">
            You want to make <em>big changes</em> but not break links you already published.
          </p>
          <p className="mt-3 text-sm leading-6 text-neutral-700">
            You already published a bundle to the web, and you just renamed several pages, or moved a bunch of pages into a directory.
          </p>
          <p className="mt-3 text-sm leading-6 text-neutral-700">
            A new version freezes the existing generated files and creates a new current version. Publishing destinations decide separately whether readers of earlier publications should be connected to it.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={onCreateNewVersion}
              disabled={createNewVersionDisabled || !versions[0].savedGenerationId}
              className="rounded bg-btn-confirm-normal px-3 py-1.5 text-sm font-medium text-btn-confirm-text hover:bg-btn-confirm-hover disabled:cursor-not-allowed disabled:opacity-50"
            >Create New Version</button>
            {!versions[0].savedGenerationId && (
              <span className="text-xs text-neutral-500">Save your current changes first.</span>
            )}
          </div>
        </section>
      ) : (
        <div className="space-y-3">
          {displayVersions.map(({ version, manifestIndex }) => {
            const isLatest = manifestIndex === versions.length - 1;
            return (
            <article
              key={version.versionId}
              data-testid="version-card"
              data-version-id={version.versionId}
              data-version-name={casualVersionName(manifestIndex)}
              data-version-age={isLatest ? 'latest' : 'older'}
              className={`rounded-lg border p-4 ${
                version.displayState === 'integrity-problem'
                  ? 'border-danger-400 bg-danger-50'
                  : isLatest
                    ? 'border-blue-200 bg-white'
                    : 'border-neutral-200 bg-neutral-50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-base font-semibold ${isLatest ? 'text-neutral-900' : 'text-neutral-600'}`}>{casualVersionName(manifestIndex)}</span>
                    <span className="font-mono text-xs text-neutral-400">{version.versionId}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${stateClassName[version.displayState]}`}>{stateLabel[version.displayState]}</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">Created {new Date(version.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {version.displayState === 'integrity-problem' && (
                    <button
                      className="rounded bg-btn-standard-normal px-3 py-1 text-xs font-medium text-btn-standard-text hover:bg-btn-standard-hover disabled:opacity-50"
                      disabled={busyVersionId === version.versionId}
                      onClick={() => void runAction(version.versionId, `/bundles/${bundleSlug}/review/versions/${version.versionId}/restore-frozen`)}
                    >Restore Frozen Version from Git</button>
                  )}
                  {version.displayState === 'frozen' && (
                    <button
                      className="rounded border border-danger-300 px-3 py-1 text-xs font-medium text-danger-700 hover:bg-danger-50 disabled:opacity-50"
                      disabled={busyVersionId === version.versionId}
                      onClick={() => {
                        if (confirm('Delete this frozen version’s local files? Remote copies and publication history are unaffected.')) {
                          void runAction(version.versionId, `/bundles/${bundleSlug}/review/versions/${version.versionId}`, 'DELETE');
                        }
                      }}
                    >Delete Local Files</button>
                  )}
                  {isLatest && (pendingBundleRename || (version.displayState === 'unsaved' && !version.savedGenerationId)) && (
                    <button
                      className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      disabled={busyVersionId === version.versionId}
                      onClick={() => {
                        if (confirm(pendingBundleRename
                          ? 'Undo this rename, restore the old bundle folder, and discard the rename-created version?'
                          : 'Cancel this never-saved version and return to its predecessor?')) {
                          void runAction(version.versionId, `/bundles/${bundleSlug}/review/versions/current/cancel`);
                        }
                      }}
                    >{pendingBundleRename ? 'Undo Rename' : 'Cancel New Version'}</button>
                  )}
                </div>
              </div>

              {version.displayState === 'integrity-problem' && (
                <div className="mt-3 rounded border border-danger-200 bg-white p-3 text-sm text-danger-800">
                  <div className="font-medium">Frozen version modified locally</div>
                  <p className="mt-1 text-xs">Frozen files cannot be edited. Restore them from Git before saving, creating, sharing, exporting, or deleting versions.</p>
                  <ul className="mt-2 space-y-1 font-mono text-xs">
                    {version.integrityChanges.map(change => <li key={change.relativePath}>{change.status} {change.relativePath}</li>)}
                  </ul>
                </div>
              )}

              <div className="mt-3">
                <div className="text-xs font-medium text-neutral-500">Local note</div>
                {editingVersionId === version.versionId ? (
                  <div className="mt-1 flex items-start gap-2">
                    <textarea value={editingNotes} onChange={event => setEditingNotes(event.target.value)} rows={2} className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm" autoFocus />
                    <button onClick={() => void saveNotes(version.versionId)} className="rounded bg-btn-confirm-normal px-3 py-1 text-xs text-btn-confirm-text">Save</button>
                    <button onClick={() => setEditingVersionId(null)} className="rounded border border-neutral-300 px-3 py-1 text-xs">Cancel</button>
                  </div>
                ) : (
                  <button
                    className="mt-1 block w-full rounded px-2 py-1 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                    onClick={() => { setEditingVersionId(version.versionId); setEditingNotes(version.notes); }}
                  >{version.notes || 'Add a note…'}</button>
                )}
              </div>
              <details className="mt-3 text-xs text-neutral-500">
                <summary className="cursor-pointer">Diagnostic details</summary>
                <div className="mt-1 font-mono">Saved generation: {version.savedGenerationId || 'none'}</div>
              </details>
            </article>
          );})}
        </div>
      )}

      {versions.length > 1 && comparisonOptions.length > 0 && (
        <section className="mt-5 rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-neutral-800">Compare generated files</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <select value={leftComparison} onChange={event => setLeftComparison(event.target.value)} className="rounded border border-neutral-300 px-2 py-1">
              {comparisonOptions.map(({ version, manifestIndex }) => (
                <option key={version.versionId} value={version.versionId}>
                  {casualVersionName(manifestIndex)} — {versionCreatedDate(version.createdAt)}
                </option>
              ))}
            </select>
            <span className="text-neutral-400">to</span>
            <select value={rightComparison} onChange={event => setRightComparison(event.target.value)} className="rounded border border-neutral-300 px-2 py-1">
              <option value="working">{casualVersionName(versions.length - 1)} current working generation{versions.at(-1)?.displayState === 'unsaved' ? ' (unsaved)' : ''}</option>
              {comparisonOptions.map(({ version, manifestIndex }) => (
                <option key={version.versionId} value={version.versionId}>
                  {casualVersionName(manifestIndex)} saved — {versionCreatedDate(version.createdAt)}
                </option>
              ))}
            </select>
          </div>
          {comparison.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No generated-file differences.</p>
          ) : (
            <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto font-mono text-xs text-neutral-700">
              {comparison.map(change => <li key={`${change.status}:${change.relativePath}`}><span className="inline-block w-16 uppercase text-neutral-500">{change.status}</span>{change.relativePath}</li>)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
