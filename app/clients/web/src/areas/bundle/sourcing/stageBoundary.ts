/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeConfig } from '../../../../../../contracts/types/bundleNodeConfig.js';
import type { SourceProposalReview } from '../../../../../../contracts/types/sourcingProposal.js';
import { proposalRequest, ProposalRequestError } from './components/proposalClient.js';

/** A curation boundary gesture starts an isolated proposal and enters review. */
export async function stageBoundary(bundleSlug: string, nodes: BundleNodeConfig[]) {
  const review = await proposalRequest<SourceProposalReview>(bundleSlug, 'begin', {});
  const configuration = { ...review.proposal.proposed, nodes };
  try { await proposalRequest(bundleSlug, 'configuration', { revision: review.proposal.revision, configuration }); }
  catch (error) {
    if (!(error instanceof ProposalRequestError) || error.code !== 'source-refresh-consent') throw error;
    sessionStorage.setItem(`sourceProposalPendingEdit:${bundleSlug}`, JSON.stringify(configuration));
  }
}
