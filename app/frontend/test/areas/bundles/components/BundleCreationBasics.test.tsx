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

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BundleTraversalDefaultsFields } from '../../../../src/areas/bundles/components/BundleCreationBasics';

describe('BundleTraversalDefaultsFields', () => {
  it('exposes both bundle-wide depths and explains that nodes may override them', () => {
    const onOutlinksDepthChange = vi.fn();
    const onInlinksDepthChange = vi.fn();
    render(
      <BundleTraversalDefaultsFields
        outlinksDepth="2"
        inlinksDepth="1"
        onOutlinksDepthChange={onOutlinksDepthChange}
        onInlinksDepthChange={onInlinksDepthChange}
      />
    );

    expect(screen.getByText(/unless a page or folder overrides it/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Default outlink depth' }), { target: { value: '4' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Default inlink depth' }), { target: { value: '3' } });
    expect(onOutlinksDepthChange).toHaveBeenCalledWith('4');
    expect(onInlinksDepthChange).toHaveBeenCalledWith('3');
  });
});
