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

import React, { useEffect, useRef } from 'react';

interface SidebarResizeHandleProps {
  ariaLabel: string;
  direction: 'left' | 'right';
  value: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
  onReset: () => void;
  testId: string;
}

const clamp = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

const SidebarResizeHandle: React.FC<SidebarResizeHandleProps> = ({
  ariaLabel,
  direction,
  value,
  min,
  max,
  onResize,
  onReset,
  testId,
}) => {
  const stopDraggingRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopDraggingRef.current?.(), []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    stopDraggingRef.current?.();

    const startX = event.clientX;
    const startWidth = value;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const pointerDelta = moveEvent.clientX - startX;
      const widthDelta = direction === 'right' ? pointerDelta : -pointerDelta;
      onResize(clamp(startWidth + widthDelta, min, max));
    };

    const stopDragging = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      stopDraggingRef.current = null;
    };

    stopDraggingRef.current = stopDragging;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    const dividerDelta = event.key === 'ArrowRight' ? 16 : -16;
    const widthDelta = direction === 'right' ? dividerDelta : -dividerDelta;
    onResize(clamp(value + widthDelta, min, max));
  };

  return (
    <div
      role="separator"
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className="group relative z-20 w-1 flex-shrink-0 cursor-col-resize self-stretch bg-gray-100 outline-none hover:bg-blue-200 focus:bg-blue-300"
      data-testid={testId}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={handlePointerDown}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-300 group-hover:bg-blue-500 group-focus:bg-blue-600" />
    </div>
  );
};

export default SidebarResizeHandle;
