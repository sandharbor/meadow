/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';
import type { SourceProposalReview } from '../../../../../../contracts/types/areas/bundle/sourcing/sourcingProposal.js';
import { acceptedChanges } from '../../../../src/areas/bundle/sourcing/components/AcceptedChangesTray.js';

function emptyReview(): SourceProposalReview {
  const configuration = { bundle: {}, nodes: [], bundleFilters: [], globalFilters: [], deletedDefaultFilterIds: [] };
  return {
    proposal: { original: configuration, proposed: configuration, tracking: {} },
    moves: [], orphans: [], conflicts: [],
    additionTracking: { enabled: true, eligible: [], sensitiveSkipped: [] },
  } as unknown as SourceProposalReview;
}

describe('acceptance availability', () => {
  it('keeps identity inspection available without requiring acceptance of an empty review', () => {
    const changes = acceptedChanges(emptyReview(), null, 0);
    expect(changes.items.map(item => item.label)).toEqual(['Page identity']);
    expect(changes.hasChanges).toBe(false);
  });

  it('requires acceptance of an identity decision even before comparison pages are available', () => {
    const review = emptyReview();
    review.moves = [{ bundleNodeId: 'page', oldPath: 'old.md', newPath: 'new.md',
      similarity: { score: 1, criteria: [] }, confidence: 'strong', competing: false,
      evidence: [], previousRoute: [], currentRoute: [] }];
    expect(acceptedChanges(review, null, 0).hasChanges).toBe(true);
  });

  it('requires acceptance of settings without page changes', () => {
    const review = emptyReview();
    review.proposal.proposed = { ...review.proposal.proposed, bundle: { ...review.proposal.proposed.bundle, defaultOutlinksDepth: 10 } };
    const changes = acceptedChanges(review, null, 0);
    expect(changes.items.map(item => item.label)).toEqual(['Page identity', '1 setting change']);
    expect(changes.hasChanges).toBe(true);
  });
});
