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

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { eventSources } = vi.hoisted(() => ({
  eventSources: [] as Array<{
    onmessage: ((event: { data: string }) => void) | null;
    onerror: ((event: unknown) => void) | null;
    close: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('../../src/shared/utils/apiClient', () => ({
  apiRequest: vi.fn(),
  AuthenticatedEventSource: class {
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    close = vi.fn();

    constructor() {
      eventSources.push(this);
    }
  },
}));

vi.mock('../../src/shared/publishing-provider-host/providerRegistry', () => ({
  getActiveFrontendProvider: vi.fn(async () => ({
    fetchPublishedFileCounts: vi.fn(async () => ({ htmlCount: 12, otherCount: 3 })),
  })),
}));

import DeleteBundleModal from '../../src/shared/bundle-management/DeleteBundleModal';

describe('DeleteBundleModal progress', () => {
  beforeEach(() => {
    eventSources.length = 0;
  });

  it('keeps progress compact and outside the modal scroll region', async () => {
    render(
      <DeleteBundleModal
        isOpen
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        bundleSlug="published-bundle"
        isPublished
      />,
    );

    await screen.findByText(/This includes/);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Preparing to delete bundle...');
    expect(status).toHaveClass('min-h-12');
    expect(status.closest('.overflow-y-hidden')).not.toBeNull();
    expect(status.closest('.overflow-y-auto')).toBeNull();

    act(() => {
      eventSources[0].onmessage?.({
        data: JSON.stringify({
          stage: 'deleting-s3',
          message: 'Deleting published files from S3...',
        }),
      });
    });

    expect(screen.getByRole('status')).toHaveTextContent('Deleting published files from S3...');
    expect(screen.getByRole('status').closest('.overflow-y-hidden')).not.toBeNull();
  });
});
