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

import React, { useEffect, useState, useCallback } from 'react';
import { ConfigMode, ConfigFixture, PublishingProviderConfProfile } from '../../shared/types';
import { ConfigModeHelper } from '../../shared/helpers/ConfigModeHelper';

type LaunchMode = 'app' | 'browser';
const SWITCH_DOES_CHANGE_CONF_KEY = 'switch_does_change_conf';
const SWITCH_DOES_CLEAR_LOGS_KEY = 'switch_does_clear_logs';
const LAUNCH_MODE_KEY = 'dev_tools_launch_mode';

interface ConfigStatus {
  configMode: ConfigMode;
  normalConfBackupExists: boolean;
  normalConfBackupPath: string;
  activeFixture: string | null;
}

interface ConfigModeOption {
  id: string;
  label: string;
  endpoint: string;
  colorClass: string;
  activeColorClass: string;
  buttonColorClass: string;
}

const BASE_MODE_OPTIONS: ConfigModeOption[] = [
  {
    id: 'normal',
    label: 'Normal',
    endpoint: '/api/config/normal',
    colorClass: 'bg-success-50 border-success-200',
    activeColorClass: 'ring-2 ring-success-500 ring-offset-2',
    buttonColorClass: 'bg-success-500 hover:bg-success-600',
  },
  {
    id: 'missing-conf',
    label: 'Missing Conf',
    endpoint: '/api/config/test-mode/missing',
    colorClass: 'bg-warning-50 border-warning-200',
    activeColorClass: 'ring-2 ring-warning-500 ring-offset-2',
    buttonColorClass: 'bg-warning-500 hover:bg-warning-600',
  },
];

const ConfigManager: React.FC = () => {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [fixtures, setFixtures] = useState<ConfigFixture[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<PublishingProviderConfProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [launchMode, setLaunchMode] = useState<LaunchMode>(() => {
    const saved = window.localStorage.getItem(LAUNCH_MODE_KEY);
    return (saved === 'app' || saved === 'browser') ? saved : 'app';
  });
  const [switchDoesChangeConf, setSwitchDoesChangeConf] = useState<boolean>(() => {
    const saved = window.sessionStorage.getItem(SWITCH_DOES_CHANGE_CONF_KEY);
    return saved === null ? true : saved === 'true';
  });
  const [switchDoesClearLogs, setSwitchDoesClearLogs] = useState<boolean>(() => {
    const saved = window.sessionStorage.getItem(SWITCH_DOES_CLEAR_LOGS_KEY);
    return saved === 'true';
  });

  const handleLaunchModeChange = useCallback((mode: LaunchMode) => {
    setLaunchMode(mode);
    window.localStorage.setItem(LAUNCH_MODE_KEY, mode);
  }, []);

  const handleSwitchDoesChangeConf = useCallback((checked: boolean) => {
    setSwitchDoesChangeConf(checked);
    window.sessionStorage.setItem(SWITCH_DOES_CHANGE_CONF_KEY, String(checked));
  }, []);

  const handleSwitchDoesClearLogs = useCallback((checked: boolean) => {
    setSwitchDoesClearLogs(checked);
    window.sessionStorage.setItem(SWITCH_DOES_CLEAR_LOGS_KEY, String(checked));
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/config/status');
      if (!res.ok) throw new Error('Failed to fetch config status');
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchFixtures = async () => {
    try {
      const res = await fetch('/api/config/fixtures');
      if (res.ok) {
        const data = await res.json();
        setFixtures(data.fixtures || []);
      }
    } catch {
      // Ignore fixture errors
    }
  };

  const fetchProviderProfiles = async () => {
    try {
      const res = await fetch('/api/publishing-provider-confs');
      if (res.ok) {
        const data = await res.json();
        setProviderProfiles(data.profiles || []);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchFixtures();
    fetchProviderProfiles();
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null);
    if (openDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openDropdown]);

  const doAction = async (
    endpoint: string,
    method: 'POST' | 'DELETE' = 'POST',
    body?: Record<string, unknown>
  ) => {
    setActionLoading(endpoint);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Action failed');
      } else {
        setError(null);
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const clearLogs = useCallback(async () => {
    try {
      await fetch('/api/logs/clear', { method: 'POST' });
    } catch {
      // Ignore errors from clearing logs
    }
  }, []);

  const applyProviderProfile = useCallback(async (profileName: string) => {
    const key = `provider-conf:${profileName}`;
    setActionLoading(key);
    try {
      const res = await fetch('/api/publishing-provider-confs/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to apply publishing provider conf');
      } else {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  const modeHelper = status ? ConfigModeHelper.fromMode(status.configMode) : null;

  const isNormalActive = modeHelper?.isNormal ?? false;
  const isMissingConfActive = modeHelper?.isMissingConf ?? false;
  const activeFixtureName = status?.activeFixture || null;

  const fixtureOptions: ConfigModeOption[] = fixtures.map((f) => ({
    id: f.folderName,
    label: f.displayName,
    endpoint: `/api/config/test-mode/fixture/${f.folderName}`,
    colorClass: 'bg-info-50 border-info-200',
    activeColorClass: 'ring-2 ring-info-500 ring-offset-2',
    buttonColorClass: 'bg-info-500 hover:bg-info-600',
  }));

  const renderModeCard = (option: ConfigModeOption, isActive: boolean, options: { isNormalMode?: boolean; isFixture?: boolean } = {}) => {
    const { isNormalMode = false, isFixture = false } = options;
    const copyBackEndpoint = '/api/config/copy-back-to-fixture';

    return (
      <div
        key={option.id}
        className={`rounded-lg border p-4 transition-all ${option.colorClass} ${
          isActive ? option.activeColorClass : ''
        }`}
      >
        <div className="text-center mb-3">
          <div className={`text-sm font-semibold ${isActive ? 'text-neutral-900' : 'text-neutral-600'}`}>
            {option.label}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={async () => {
              setActionLoading(`${option.endpoint}-restart`);
              try {
                if (switchDoesClearLogs) {
                  await clearLogs();
                }
                const res = await fetch(option.endpoint, { method: 'POST' });
                if (res.ok) {
                  await fetchStatus();
                }
                if (launchMode === 'browser') {
                  await fetch('/api/app/open-browser', { method: 'POST' });
                } else {
                  await fetch('/api/app/launch-dev', { method: 'POST' });
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
              } finally {
                setActionLoading(null);
              }
            }}
            disabled={!!actionLoading}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:bg-neutral-300 ${option.buttonColorClass}`}
          >
            {actionLoading === `${option.endpoint}-restart` ? 'Working...' : 'Start'}
          </button>

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenDropdown(openDropdown === option.id ? null : option.id);
              }}
              disabled={!!actionLoading}
              className="px-2 py-2 rounded-lg text-sm font-medium text-neutral-600 bg-white border border-neutral-300 hover:bg-neutral-50 transition-colors disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              ⋯
            </button>

            {openDropdown === option.id && (
              <div
                className="absolute right-0 mt-1 w-48 bg-white border border-neutral-200 rounded-lg shadow-lg z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 border-b border-neutral-100">
                  <div className="text-xs font-medium text-neutral-500 mb-1.5">switch does:</div>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer mb-1">
                    <input
                      type="checkbox"
                      checked={switchDoesChangeConf}
                      onChange={(e) => handleSwitchDoesChangeConf(e.target.checked)}
                      className="rounded border-neutral-300 text-brand-500 focus:ring-brand-500"
                    />
                    change conf
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={switchDoesClearLogs}
                      onChange={(e) => handleSwitchDoesClearLogs(e.target.checked)}
                      className="rounded border-neutral-300 text-brand-500 focus:ring-brand-500"
                    />
                    clear logs
                  </label>
                </div>
                <button
                  onClick={async () => {
                    setOpenDropdown(null);
                    setActionLoading(option.endpoint);
                    try {
                      if (switchDoesClearLogs) {
                        await clearLogs();
                      }
                      if (switchDoesChangeConf) {
                        await doAction(option.endpoint, 'POST');
                      } else {
                        setActionLoading(null);
                      }
                    } catch {
                      setActionLoading(null);
                    }
                  }}
                  disabled={!!actionLoading || (isActive && isNormalMode) || (!switchDoesChangeConf && !switchDoesClearLogs)}
                  className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 disabled:text-neutral-400 disabled:hover:bg-white"
                >
                  {actionLoading === option.endpoint ? 'Working...' : 'just switch'}
                </button>
                <button
                  onClick={async () => {
                    setOpenDropdown(null);
                    setActionLoading(`${option.endpoint}-restart-only`);
                    try {
                      if (launchMode === 'browser') {
                        await fetch('/api/app/open-browser', { method: 'POST' });
                      } else {
                        await fetch('/api/app/launch-dev', { method: 'POST' });
                      }
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Unknown error');
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                  disabled={!!actionLoading}
                  className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 border-t border-neutral-100 disabled:text-neutral-400 disabled:hover:bg-white"
                >
                  {actionLoading === `${option.endpoint}-restart-only` ? 'Working...' : 'just restart app'}
                </button>
                {isFixture && isActive && (
                  <button
                    onClick={() => {
                      setOpenDropdown(null);
                      doAction(copyBackEndpoint, 'POST');
                    }}
                    disabled={!!actionLoading}
                    className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 rounded-b-lg border-t border-neutral-100 disabled:text-neutral-400 disabled:hover:bg-white"
                  >
                    {actionLoading === copyBackEndpoint ? 'Working...' : 'Copy conf back to fixture'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-full">
      <div className="p-4 max-w-4xl mx-auto space-y-4">
        {error && (
          <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg text-danger-800 text-sm">
            {error}
          </div>
        )}

        <section className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-neutral-800">Config Mode</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">Launch:</span>
              <div className="flex rounded-lg bg-neutral-100 p-0.5">
                <button
                  onClick={() => handleLaunchModeChange('app')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    launchMode === 'app'
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  App
                </button>
                <button
                  onClick={() => handleLaunchModeChange('browser')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    launchMode === 'browser'
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Browser
                </button>
              </div>
            </div>
          </div>
          <p className="text-sm text-neutral-600 mb-4">
            Test modes temporarily move your normal config aside. Click any button to switch modes or refresh the current mode.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            {renderModeCard(BASE_MODE_OPTIONS[0], isNormalActive, { isNormalMode: true })}
            {renderModeCard(BASE_MODE_OPTIONS[1], isMissingConfActive)}
          </div>

          {fixtureOptions.length > 0 && (
            <>
              <div className="text-xs font-medium text-neutral-500 mb-2 mt-4">Test Fixtures</div>
              <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${Math.min(fixtureOptions.length, 3)}, 1fr)` }}>
                {fixtureOptions.map((option) => {
                  const isActive = !!modeHelper?.isTestFixture && activeFixtureName === option.id;
                  return renderModeCard(option, isActive, { isFixture: true });
                })}
              </div>
            </>
          )}

          {modeHelper?.isTestMode && (
            <div className="mt-4 p-3 bg-warning-50 border border-warning-200 rounded-lg text-warning-800 text-sm">
              ⚠️ Currently in test mode{activeFixtureName ? ` (${fixtures.find(f => f.folderName === activeFixtureName)?.displayName || activeFixtureName})` : ` (${modeHelper.mode})`}. Your normal config is backed up at:{' '}
              <span className="font-mono text-xs">{status?.normalConfBackupPath}</span>
            </div>
          )}

          {providerProfiles.length > 0 && (
            <>
              <div className="flex items-center mt-6 mb-3 pt-4 border-t border-neutral-200">
                <h3 className="text-base font-semibold text-neutral-800">
                  Publishing Provider Confs
                </h3>
                <span className="relative group ml-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-neutral-200 text-neutral-600 text-[10px] font-bold cursor-help select-none">
                    ?
                  </span>
                  <span className="absolute left-0 top-full mt-1 hidden group-hover:block w-80 p-2 bg-neutral-800 text-white text-xs rounded-md shadow-lg z-10 font-normal leading-snug">
                    Drops a predefined publishing-provider bundle into{' '}
                    <span className="font-mono">MeadowHome/app/publishing_providers/</span>{' '}
                    so you can skip retyping settings and secrets. Each profile replaces matching provider folders. Disabled in Normal mode to avoid touching your real config. Add those predefined bundles at{' '}
                    <span className="font-mono">app/dev_tools_app/publishing_provider_confs/</span>.
                  </span>
                </span>
                {isNormalActive && (
                  <span className="ml-3 text-xs font-normal text-neutral-400">
                    (disabled in Normal mode)
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {providerProfiles.map((profile) => {
                  const key = `provider-conf:${profile.name}`;
                  const disabled = isNormalActive || !!actionLoading;
                  return (
                    <button
                      key={profile.name}
                      onClick={() => applyProviderProfile(profile.name)}
                      disabled={disabled}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 transition-colors disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed"
                    >
                      <span className="truncate">
                        {actionLoading === key ? 'Working...' : profile.name}
                      </span>
                      {profile.providerClassNames.length > 0 && (
                        <span className="ml-3 text-xs text-neutral-400 font-normal truncate">
                          → {profile.providerClassNames.join(', ')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default ConfigManager;
