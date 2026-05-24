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
import { ScopeTabs } from './ScopeTabs';

interface ConfigSectionProps {
  title: string;
  scope: 'global' | 'site';
  onScopeChange: (scope: 'global' | 'site') => void;
  disabled?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const ConfigSection: React.FC<ConfigSectionProps> = ({
  title,
  scope,
  onScopeChange,
  disabled,
  children,
  footer,
}) => {
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium text-neutral-700">{title}</div>
        <ScopeTabs scope={scope} onScopeChange={onScopeChange} disabled={disabled} />
      </div>
      <div className="rounded border border-neutral-200">
        {children}
      </div>
      {footer && (
        <div className="mt-2 text-xs text-neutral-500">
          {footer}
        </div>
      )}
    </div>
  );
};
