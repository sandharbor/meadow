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
import { useEditorViewValue } from '../utils/useEditorViewValue.js';
import SidebarResizeHandle from './SidebarResizeHandle';

interface ResizableSidebarProps {
  bundleSlug: string;
  side: 'left' | 'right';
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey: string;
  ariaLabel: string;
  testId: string;
  className: string;
  children: React.ReactNode;
}

const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
  bundleSlug,
  side,
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
  ariaLabel,
  testId,
  className,
  children,
}) => {
  const [storedWidth, setWidth] = useEditorViewValue(bundleSlug, storageKey, defaultWidth);
  const width = Number.isFinite(storedWidth) ? Math.max(minWidth, Math.min(maxWidth, storedWidth)) : defaultWidth;

  const resizeHandle = (
    <SidebarResizeHandle
      ariaLabel={ariaLabel}
      direction={side === 'left' ? 'right' : 'left'}
      value={width}
      min={minWidth}
      max={maxWidth}
      onResize={setWidth}
      onReset={() => setWidth(defaultWidth)}
      testId={`${testId}-resize-handle`}
    />
  );

  const panel = (
    <div
      className={`flex-shrink-0 ${className}`}
      data-testid={testId}
      style={{ width: `${width}px` }}
    >
      {children}
    </div>
  );

  return side === 'left' ? <>{panel}{resizeHandle}</> : <>{resizeHandle}{panel}</>;
};

export default ResizableSidebar;
