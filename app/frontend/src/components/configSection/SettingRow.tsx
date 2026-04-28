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

import React from 'react';

type OverrideSetting = 'inherit' | 'enabled' | 'disabled';

interface SettingRowProps {
  name: string;
  globalValue: boolean;
  siteSetting: OverrideSetting;
  onSiteSettingChange: (setting: OverrideSetting) => void;
  action?: React.ReactNode;
  disabled?: boolean;
  dimmed?: boolean;
  tooltip?: string;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  name,
  globalValue,
  siteSetting,
  onSiteSettingChange,
  action,
  disabled,
  dimmed,
  tooltip,
}) => {
  const effectiveValue = siteSetting === 'inherit' ? globalValue : siteSetting === 'enabled';

  return (
    <div
      className={`grid ${action ? 'grid-cols-[1fr,50px,80px,44px,auto]' : 'grid-cols-[1fr,50px,80px,44px]'} items-center gap-2 px-3 py-2 border-b border-neutral-100 last:border-b-0 ${
        dimmed ? 'opacity-50' : ''
      }`}
      title={tooltip}
    >
      <span className="text-neutral-700 truncate min-w-0">{name}</span>
      <span className="text-neutral-500 text-center">
        {globalValue ? 'On' : 'Off'}
      </span>
      <select
        value={siteSetting}
        onChange={(e) => onSiteSettingChange(e.target.value as OverrideSetting)}
        disabled={disabled}
        className="text-xs border border-neutral-300 rounded px-0.5 py-0.5 bg-white disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
      >
        <option value="inherit">Global</option>
        <option value="enabled">On</option>
        <option value="disabled">Off</option>
      </select>
      <span className={`text-xs text-center ${effectiveValue ? 'text-success-600' : 'text-neutral-400'}`}>
        {effectiveValue ? 'On' : 'Off'}
      </span>
      {action}
    </div>
  );
};

interface GlobalSettingRowProps {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  action?: React.ReactNode;
  disabled?: boolean;
  dimmed?: boolean;
  tooltip?: string;
}

export const GlobalSettingRow: React.FC<GlobalSettingRowProps> = ({
  name,
  checked,
  onChange,
  action,
  disabled,
  dimmed,
  tooltip,
}) => {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 border-b border-neutral-100 last:border-b-0 ${
        dimmed ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      title={tooltip}
    >
      <label className={`flex min-w-0 flex-1 items-center gap-3 ${dimmed ? '' : 'cursor-pointer hover:bg-neutral-50'}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled || dimmed}
          className="w-4 h-4 text-main-600 border-neutral-300 rounded focus:ring-main-500"
        />
        <span className="text-neutral-700">{name}</span>
      </label>
      {action}
    </div>
  );
};
