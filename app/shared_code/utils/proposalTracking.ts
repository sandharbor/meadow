/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { ProposalTrackingDecision } from '../../contracts/types/sourcingProposal.js';
import type { BundleNodeId } from '../../contracts/types/bundleNodeConfig.js';

export interface ProposalTrackingTarget {
  bundleNodeId?: BundleNodeId;
  /** Absent when safe; changes whenever the effective sensitive evidence changes. */
  sensitivity?: string;
  sensitivityReasons?: string[];
}

/** The targets and their assessment must come from the same captured material and policy. */
export function revalidateProposalTracking(
  decisions: Record<string, ProposalTrackingDecision>, targets: Record<string, ProposalTrackingTarget>,
): Record<string, ProposalTrackingDecision> {
  return Object.fromEntries(Object.entries(decisions).map(([key, previous]) => {
    const decision = { ...previous };
    const target = targets[key];
    delete decision.invalidated;
    delete decision.needsConfirmation;
    if (decision.identityChanged) {
      decision.invalidated = 'The page identity changed after this tracking choice. Review the current page before applying it.';
    } else if (!target && decision.track) {
      decision.invalidated = 'This page is no longer included in the proposed material.';
    } else if (decision.track && target.sensitivity) {
      if (decision.origin === 'automatic') decision.track = false;
      else if (decision.confirmedSensitivity !== target.sensitivity) decision.needsConfirmation = true;
    }
    return [key, decision];
  }));
}

import type { ParticipatesIn, sourceReviewSensitivity } from '../../concepts/index.js';
export type ProposalTrackingMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceReviewSensitivity, 'revalidate-tracking', typeof revalidateProposalTracking>,
];
