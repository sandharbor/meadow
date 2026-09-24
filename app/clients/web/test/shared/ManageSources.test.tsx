/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ManageSources } from '../../src/areas/bundle/sourcing/components/ManageSources.js';
import { apiRequest } from '../../src/shared/utils/apiClient.js';
import { Graph } from '../../../../contracts/types/graph.js';
import type { SourceRegistryStatus } from '../../../../contracts/types/sourcing.js';

vi.mock('../../src/shared/utils/apiClient.js', () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const status: SourceRegistryStatus = {
  sources: [{ id: 'notes', name: 'notes', directory: '/notes' }],
  startingSelections: [{ sourceId: 'notes', kind: 'file', path: 'Start.md' }],
  disconnectedIds: [], ignoredSourceNames: [], pendingChanges: true,
};

it('opens the existing pending review without submitting edits or refreshing material', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(new globalThis.Response(JSON.stringify(status)));
  const onClose = vi.fn();
  const onStaged = vi.fn();
  render(<ManageSources bundleSlug="example" graph={new Graph()} isOpen onClose={onClose} onOpen={() => {}} onStaged={onStaged} onChanged={() => {}} />);
  const pending = await screen.findByRole('button', { name: 'Changes awaiting review' });
  expect(screen.getByRole('textbox', { name: 'Directory for notes' })).toHaveValue('/notes');
  // Newly typed edits stay in the form until Save updates the review.
  fireEvent.change(screen.getByRole('textbox', { name: 'Directory for notes' }), { target: { value: '/relocated' } });
  expect(pending).toBeDisabled();
  expect(screen.getByText('Save your edits to update the review.')).toBeInTheDocument();
  fireEvent.click(pending);
  expect(onStaged).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Directory for notes' }), { target: { value: '/notes' } });
  expect(pending).toBeEnabled();
  await act(async () => { fireEvent.click(pending); });
  expect(onClose).toHaveBeenCalledOnce();
  expect(onStaged).toHaveBeenCalledOnce();
  expect(apiRequest).toHaveBeenCalledTimes(1);
  expect(apiRequest).toHaveBeenCalledWith('bundles/example/sourcing/sources');
});
