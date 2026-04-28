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

interface ScopeTabsProps {
  scope: 'global' | 'site';
  onScopeChange: (scope: 'global' | 'site') => void;
  disabled?: boolean;
}

export const ScopeTabs: React.FC<ScopeTabsProps> = ({ scope, onScopeChange, disabled }) => {
  return (
    <div className="flex gap-1 bg-neutral-100 p-0.5 rounded-md">
      <button
        onClick={() => onScopeChange('global')}
        className={`px-3 py-1 text-sm rounded transition-colors ${
          scope === 'global'
            ? 'bg-white text-neutral-800 font-medium shadow-sm'
            : 'text-neutral-600 hover:text-neutral-800'
        }`}
        disabled={disabled}
      >
        Global
      </button>
      <button
        onClick={() => onScopeChange('site')}
        className={`px-3 py-1 text-sm rounded transition-colors ${
          scope === 'site'
            ? 'bg-white text-neutral-800 font-medium shadow-sm'
            : 'text-neutral-600 hover:text-neutral-800'
        }`}
        disabled={disabled}
      >
        This site
      </button>
    </div>
  );
};
