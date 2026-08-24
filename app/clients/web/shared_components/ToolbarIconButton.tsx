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

interface ToolbarIconButtonProps {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}

/**
 * A square icon button with a border, used for toolbar actions.
 * Provides consistent styling across the application for icon-only buttons
 * in toolbars and headers.
 */
export function ToolbarIconButton({
  onClick,
  disabled = false,
  active = false,
  title,
  children,
}: ToolbarIconButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded border transition-colors ${
        active
          ? 'bg-main-50 border-main-300 text-main-600'
          : 'bg-neutral-50 border-neutral-300 text-neutral-600 hover:bg-neutral-100'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}
