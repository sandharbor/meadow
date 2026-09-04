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
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/utils/apiClient', () => ({
  apiRequest: vi.fn(),
}));

import RenameBundleModal from '../../src/shared/bundle-management/RenameBundleModal';
import { apiRequest } from '../../src/shared/utils/apiClient';

describe('RenameBundleModal', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockResolvedValue({
      ok: true,
      json: async () => ({
        bundleSlug: 'existing-bundle',
        hasGeneratedVersion: false,
        willCreateGeneratedVersion: false,
        providers: [],
      }),
    } as Awaited<ReturnType<typeof apiRequest>>);
  });

  it('lowercases the name and replaces runs of spaces with hyphens as it is entered', async () => {
    render(
      <RenameBundleModal
        isOpen
        bundleSlug="existing-bundle"
        onClose={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );

    const input = await screen.findByRole('textbox', { name: 'New bundle name' });
    fireEvent.change(input, { target: { value: 'My New   Bundle' } });

    expect(input).toHaveValue('my-new-bundle');
    expect(screen.getByText(/Uppercase letters become lowercase/)).toBeInTheDocument();
  });
});
