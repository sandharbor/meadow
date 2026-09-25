/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import React, { useCallback, useEffect, useState } from 'react';
import type { ConfigFixture, OpenSavedState, PublishingProviderConfProfile, SavedStateOrigin, ServiceTarget } from '../../shared/types';
import { QaPanel } from './QaPanel.js';
import { SourceChangesControl } from './SourceChangesControl.js';
import { SplitOpenButton, type TargetAvailability } from './SplitOpenButton.js';

export type LaunchMode = 'app' | 'browser';
const LAUNCH_MODE_KEY = 'dev_tools_launch_mode';

const FIXTURE_ROW_IDS = [
  ['home_fixture_big_and_small', 'home_fixture_example'],
  ['home_fixture_multi_source', 'home_fixture_minimal'],
  ['home_fixture_folder_structure_single', 'home_fixture_folder_structure_multiple'],
  ['home_fixture_hooks', 'home_fixture_nested', 'home_fixture_srs'],
] as const;

const BOTH_TARGETS: Record<ServiceTarget, TargetAvailability> = { local: { available: true }, hosted: { available: true } };

export async function requestJson<T = unknown>(endpoint: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
  const response = await fetch(endpoint, init);
  const data = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : `Request failed (${response.status})`);
  return data as T;
}

export function openSavedStateRequest(origin: SavedStateOrigin, serviceTarget: ServiceTarget, launch: LaunchMode, targetPath = '/') {
  return requestJson<{ state: OpenSavedState }>('/api/saved-states/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, serviceTarget, launch, targetPath }),
  });
}

const SavedStatesManager: React.FC = () => {
  const [current, setCurrent] = useState<OpenSavedState | null>(null);
  const [fixtures, setFixtures] = useState<ConfigFixture[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<PublishingProviderConfProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [launchMode, setLaunchMode] = useState<LaunchMode>(() => {
    const saved = window.localStorage.getItem(LAUNCH_MODE_KEY);
    return saved === 'browser' ? 'browser' : 'app';
  });

  const refresh = useCallback(async () => {
    const data = await requestJson<{ current: OpenSavedState; fixtures: ConfigFixture[] }>('/api/saved-states');
    setCurrent(data.current);
    setFixtures(data.fixtures);
  }, []);

  useEffect(() => {
    refresh().catch(err => setError(err instanceof Error ? err.message : String(err)));
    requestJson<{ profiles: PublishingProviderConfProfile[] }>('/api/publishing-provider-confs')
      .then(data => setProviderProfiles(data.profiles))
      .catch(() => { /* Profiles are optional. */ });
    const onFocus = () => { void refresh().catch(() => { /* Keep the last known state. */ }); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const changeLaunchMode = (mode: LaunchMode) => {
    setLaunchMode(mode);
    window.localStorage.setItem(LAUNCH_MODE_KEY, mode);
  };

  const open = async (key: string, origin: SavedStateOrigin, target: ServiceTarget) => {
    setBusy(key); setError(null);
    try {
      const result = await openSavedStateRequest(origin, target, launchMode);
      setCurrent(result.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refresh().catch(() => { /* Keep the error visible. */ });
    } finally {
      setBusy(null);
    }
  };

  const applyProviderProfile = async (profileName: string) => {
    setBusy(`provider:${profileName}`); setError(null);
    try {
      await requestJson('/api/publishing-provider-confs/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileName }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const fixtureById = new Map(fixtures.map(fixture => [fixture.folderName, fixture]));
  const rows: ConfigFixture[][] = FIXTURE_ROW_IDS
    .map(ids => ids.map(id => fixtureById.get(id)).filter((fixture): fixture is ConfigFixture => Boolean(fixture)))
    .filter(row => row.length > 0);
  const grouped = new Set<string>(FIXTURE_ROW_IDS.flat());
  const remaining = fixtures.filter(fixture => !grouped.has(fixture.folderName));
  for (let index = 0; index < remaining.length; index += 3) rows.push(remaining.slice(index, index + 3));

  const isOpen = (origin: SavedStateOrigin) => current !== null && JSON.stringify(current.origin) === JSON.stringify(origin);
  const hostedProfilesUsable = current !== null && current.origin.kind !== 'normal' && current.serviceTarget === 'hosted';

  const card = (key: string, title: string, origin: SavedStateOrigin, children: React.ReactNode, options: {
    defaultTarget?: ServiceTarget; targets?: Record<ServiceTarget, TargetAvailability>;
  } = {}) => <div key={key} data-testid={`fixture-card-${key}`} className={`rounded-lg border border-info-200 bg-info-50 p-4 ${isOpen(origin) ? 'ring-2 ring-info-500 ring-offset-2' : ''}`}>
    <SplitOpenButton
      label={title}
      defaultTarget={options.defaultTarget}
      targets={options.targets ?? BOTH_TARGETS}
      busy={busy === key}
      disabled={busy !== null && busy !== key}
      onOpen={target => void open(key, origin, target)}
    />
    {children}
  </div>;

  return <div className="min-h-full">
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      {error && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">{error}</div>}
      {current && <QaPanel state={current} />}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-800">Saved states</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Launch:</span>
            <div className="flex rounded-lg bg-neutral-100 p-0.5">
              {(['app', 'browser'] as const).map(mode => <button key={mode} onClick={() => changeLaunchMode(mode)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${launchMode === mode ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}>
                {mode === 'app' ? 'App' : 'Browser'}
              </button>)}
            </div>
          </div>
        </div>
        <p className="mb-4 text-sm text-neutral-600">
          Every saved state opens in its own home folder; your real Meadow Home is never moved. Open uses Local services; the arrow offers Hosted Development where it can work.
        </p>
        <div className="mb-3 grid grid-cols-2 gap-3">
          {card('normal', 'Normal', { kind: 'normal' }, null, {
            defaultTarget: 'hosted',
            targets: { hosted: { available: true }, local: { available: false, reason: 'Normal is your real Meadow Home; it keeps the services it is configured for.' } },
          })}
          {card('empty', 'Empty Home', { kind: 'empty' }, null, {
            defaultTarget: 'hosted',
            targets: { hosted: { available: true }, local: { available: false, reason: 'A fresh install has no home to wire to local services yet.' } },
          })}
        </div>
        <div className="mb-2 mt-4 text-xs font-medium text-neutral-500">Home fixtures</div>
        <div className="space-y-3">
          {rows.map(row => <div key={row.map(fixture => fixture.folderName).join(':')} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
            {row.map(fixture => card(fixture.folderName, fixture.displayName, { kind: 'fixture', fixture: fixture.folderName },
              fixture.hasSourceChanges && <SourceChangesControl
                fixtureName={fixture.folderName}
                pending={busy !== null}
                launchMode={launchMode}
                openStateId={current?.id ?? null}
                onOpened={state => setCurrent(state)}
              />))}
          </div>)}
        </div>

        {providerProfiles.length > 0 && <>
          <div className="mb-3 mt-6 flex items-center border-t border-neutral-200 pt-4">
            <h3 className="text-base font-semibold text-neutral-800">Hosted Development credentials</h3>
            {!hostedProfilesUsable && <span className="ml-3 text-xs font-normal text-neutral-400">(open a saved state with Hosted Development to use these)</span>}
          </div>
          <div className="flex flex-col gap-2">
            {providerProfiles.map(profile => <button key={profile.name} onClick={() => void applyProviderProfile(profile.name)} disabled={!hostedProfilesUsable || busy !== null}
              className="flex w-full items-center justify-between rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400">
              <span className="truncate">{busy === `provider:${profile.name}` ? 'Working...' : profile.name}</span>
              {profile.providerClassNames.length > 0 && <span className="ml-3 truncate text-xs font-normal text-neutral-400">→ {profile.providerClassNames.join(', ')}</span>}
            </button>)}
          </div>
        </>}
      </section>
    </div>
  </div>;
};

export default SavedStatesManager;
