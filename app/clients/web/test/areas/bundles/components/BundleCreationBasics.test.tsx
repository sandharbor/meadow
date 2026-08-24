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
import {
  BundleTraversalDefaultsFields,
  SourceDirectoryField,
} from '../../../../src/areas/bundles/components/BundleCreationBasics';

describe('SourceDirectoryField', () => {
  it('keeps other bundle directories available when the recent default is collapsed', () => {
    const onChange = vi.fn();
    render(
      <SourceDirectoryField
        value="/notes/recent"
        directories={['/notes/recent', '/notes/older']}
        isManuallyEdited={false}
        onStartManualEdit={vi.fn()}
        onChange={onChange}
        onBrowse={vi.fn()}
      />
    );

    expect(screen.getByTitle('/notes/recent')).toBeInTheDocument();
    const existingDirectoryPicker = screen.getByRole('combobox', { name: 'Use a directory from another bundle' });
    expect(screen.queryByRole('option', { name: '/notes/recent' })).not.toBeInTheDocument();
    fireEvent.change(existingDirectoryPicker, { target: { value: '/notes/older' } });
    expect(onChange).toHaveBeenCalledWith('/notes/older');
  });

  it('can explain the broader notes root used by folder bundles', () => {
    render(
      <SourceDirectoryField
        value="/notes"
        directories={['/notes']}
        isManuallyEdited={false}
        label="Notes Root"
        helpText="Every selected folder must be inside it. In Obsidian, this is usually your vault folder."
        onStartManualEdit={vi.fn()}
        onChange={vi.fn()}
        onBrowse={vi.fn()}
      />
    );

    expect(screen.getByText('Notes Root *')).toBeInTheDocument();
    expect(screen.getByText(/Every selected folder must be inside it/)).toBeInTheDocument();
  });
});

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
