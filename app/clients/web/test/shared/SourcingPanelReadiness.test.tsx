/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SourcingPanel } from '../../src/areas/bundle/sourcing/components/SourcingPanel.js';
import { PlaceContext, type PlaceContextValue, type SurfaceParticipant } from '../../src/shared/places/placeContext.js';
import { apiRequest } from '../../src/shared/utils/apiClient.js';
import type { SourcingReview } from '../../../../contracts/types/shared/sourcing/sourcing.js';

vi.mock('../../src/shared/utils/apiClient.js', () => ({ apiRequest: vi.fn() }));
// A workspace whose page changes graph is ready as soon as it mounts.
vi.mock('../../src/areas/bundle/sourcing/components/SourcingWorkspace.js', () => ({
  SourcingWorkspace: ({ onReadyChange }: { onReadyChange?: (ready: boolean) => void }) => {
    useEffect(() => { onReadyChange?.(true); return () => onReadyChange?.(false); }, [onReadyChange]);
    return <div data-testid="sourcing-workspace" />;
  },
}));
afterEach(() => vi.resetAllMocks());

const review: SourcingReview = {
  accepted: { id: 'a'.repeat(32), capturedAt: '2026-09-07T12:00:00Z', fileCount: 1 },
  moves: [], changes: [], orphans: [], history: [], reviewToken: 'unchanged',
};

it('keeps a ready review in sourcing mode when a link closes and reopens it in one update', async () => {
  vi.mocked(apiRequest).mockImplementation(async () => new globalThis.Response(JSON.stringify(review)));
  const surfaces = new Map<string, SurfaceParticipant>();
  let requestMode!: (mode: 'curation' | 'sourcing') => Promise<void>;
  const place: PlaceContextValue = {
    openPlace: () => {}, openLink: () => {}, isSurfaceRequested: () => false,
    registerSurface: participant => { surfaces.set(participant.surface, participant); return () => {}; },
    reportSurface: () => {}, registerSelection: () => () => {}, reportSelection: () => {},
    registerEditorMode: onRequest => { requestMode = onRequest; return () => {}; }, reportEditorMode: () => {},
  };
  const onModeChange = vi.fn();
  render(<PlaceContext.Provider value={place}><SourcingPanel bundleSlug="example" hasDraftChanges={false} onAccepted={() => {}} onModeChange={onModeChange} /></PlaceContext.Provider>);
  await act(async () => { await requestMode('sourcing'); });
  expect(onModeChange).toHaveBeenLastCalledWith(true);

  // Restoring a place can close the review and ask for sourcing again before React renders.
  await act(async () => {
    void surfaces.get('source-review')!.onRequest(null);
    void requestMode('sourcing');
  });
  expect(screen.getByTestId('sourcing-workspace')).toBeInTheDocument();
  expect(onModeChange).toHaveBeenLastCalledWith(true);
});
