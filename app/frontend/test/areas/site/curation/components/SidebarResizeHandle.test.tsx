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

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SidebarResizeHandle from '../../../../../src/areas/site/curation/components/SidebarResizeHandle';

interface RenderHandleOptions {
  direction?: 'left' | 'right';
  value?: number;
  onResize?: (width: number) => void;
  onReset?: () => void;
}

const renderHandle = ({
  direction = 'right',
  value = 300,
  onResize = vi.fn(),
  onReset = vi.fn(),
}: RenderHandleOptions = {}) => {
  render(
    <SidebarResizeHandle
      ariaLabel="Resize test sidebar"
      direction={direction}
      value={value}
      min={240}
      max={480}
      onResize={onResize}
      onReset={onReset}
      testId="test-resize-handle"
    />
  );
  return { handle: screen.getByRole('separator', { name: 'Resize test sidebar' }), onResize, onReset };
};

describe('SidebarResizeHandle', () => {
  it('resizes a left sidebar in the divider arrow direction', () => {
    const { handle, onResize } = renderHandle();

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });

    expect(onResize).toHaveBeenNthCalledWith(1, 316);
    expect(onResize).toHaveBeenNthCalledWith(2, 284);
  });

  it('reverses width changes for a sidebar on the divider right', () => {
    const onResize = vi.fn();
    const { handle } = renderHandle({ direction: 'left', onResize });

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });

    expect(onResize).toHaveBeenNthCalledWith(1, 316);
    expect(onResize).toHaveBeenNthCalledWith(2, 284);
  });

  it('resets to the default width on double click', () => {
    const onReset = vi.fn();
    const { handle } = renderHandle({ onReset });

    fireEvent.doubleClick(handle);

    expect(onReset).toHaveBeenCalledOnce();
  });

  it('tracks pointer movement while dragging', () => {
    const onResize = vi.fn();
    const { handle } = renderHandle({ value: 300, onResize });

    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 140 });
    fireEvent.pointerUp(window);

    expect(onResize).toHaveBeenCalledWith(340);
  });
});
