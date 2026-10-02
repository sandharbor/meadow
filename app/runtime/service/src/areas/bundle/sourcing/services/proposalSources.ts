/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleSource } from '../../../../../../../contracts/types/bundleConfig.js';
import type { StartingSelection } from '../../../../../../../contracts/types/startingSelection.js';
import { sourceProposalContext } from '../../../../shared/source-snapshot/sourceRegistrySnapshots.js';
import { loadSourcingState, SourcingError, type SourceSnapshot } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { beginSourceProposal, loadPendingSourceProposal } from './proposalStore.js';
import { updateSourceProposalCapture } from './proposalCapture.js';
import { registryProposal } from './sourceRegistryReview.js';
import { saveSourceRegistry } from './saveSourceRegistry.js';

/** Source repairs belong to the existing proposal, including its pending page and filter edits. */
export async function saveProposalSourceRegistry(directory: string, sources: BundleSource[], selections?: StartingSelection[], revision?: number): Promise<boolean> {
  const pending = loadPendingSourceProposal(directory);
  if (pending) {
    if (pending.revision !== revision) throw new SourcingError('The source proposal changed. Reopen source settings before saving.');
    const registry = registryProposal(directory, sources, selections, undefined, { config: pending.proposed.bundle, nodes: pending.proposed.nodes });
    const context = sourceProposalContext(pending.proposed.bundle, pending.proposed.nodes, { sourceProposal: registry } as SourceSnapshot);
    await updateSourceProposalCapture(directory, pending.revision, {
      configuration: { ...pending.proposed, bundle: context.config, nodes: context.nodes }, incorporateNewerSources: true,
    });
    return true;
  }
  // A standalone Save may finish an unchanged-material source relocation. If
  // material differs, carry that capture into the durable proposal before review.
  await saveSourceRegistry(directory, sources, selections);
  if (!loadSourcingState(directory)?.candidateId) return false;
  await beginSourceProposal(directory);
  return true;
}
