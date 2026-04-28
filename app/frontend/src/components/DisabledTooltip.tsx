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

/**
 * Wraps a button (or any element) so that a CSS-driven tooltip appears
 * immediately on hover when the element is disabled. Uses Tailwind
 * `group-hover` for zero-delay display — no JS timers needed.
 *
 * Usage:
 *   <DisabledTooltip disabled={isDisabled} tooltip="Reason it's disabled">
 *     <button disabled={isDisabled} ...>Label</button>
 *   </DisabledTooltip>
 */
export const DisabledTooltip: React.FC<{
  disabled: boolean | undefined;
  tooltip?: string;
  children: React.ReactNode;
  /** 'above' (default) positions the tooltip above the element, 'below' positions it below. */
  position?: 'above' | 'below';
  /** Horizontal alignment relative to the wrapper. Default: 'center'. */
  align?: 'center' | 'right' | 'left';
  /** Extra CSS classes on the wrapper <span> (e.g. 'flex-1' or 'block'). */
  className?: string;
}> = ({ disabled, tooltip, children, position = 'above', align = 'center', className }) => {
  const posClass = position === 'above' ? 'bottom-full mb-1' : 'top-full mt-1';
  const alignClass =
    align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : align === 'right'
        ? 'right-0'
        : 'left-0';

  return (
    <span className={`relative group ${className ?? ''}`}>
      {children}
      {disabled && tooltip && (
        <span
          className={`absolute ${posClass} ${alignClass} w-max max-w-48 p-1.5 bg-white text-gray-700 text-xs rounded border border-gray-200 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-[9999]`}
        >
          {tooltip}
        </span>
      )}
    </span>
  );
};
