/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../language.js';

// Temporary project filter requested for the design review; remove after that review.
export const sourcingReviewRedesign = define({
  id: id.sourcingReviewRedesign, name: 'Sourcing review redesign', kind: 'capability', searchFacet: true,
  definition: text`Temporary project tag grouping the acceptance files affected by the sourcing review redesign, including its supporting report tooling.`,
  mechanics: [text`This is a review filter, not an implementation or coverage claim. Remove the temporary association after this project review; retain each scenario's specific domain concepts.`],
  interplay: text`The project connects ${link(id.pendingSourceProposal, 'Pending Source Proposal')}, ${link(id.sourceReviewWorkspace, 'Source Review Workspace')}, and ${link(id.conceptImplementationNavigation, 'Concept Implementation Navigation')}.`,
});

export const checkpointViewRestoration = define({
  id: id.checkpointViewRestoration, name: 'Checkpoint View Restoration', kind: 'capability', searchFacet: true,
  parentId: id.checkpoint,
  definition: text`Proposed: a checkpoint restores the precise editor and dialog interaction state in a fresh Dev Tools fork, including both sourcing and curation views.`,
  mechanics: [
    text`Capture active mode, both modes' filters, solo and hidden sets, highlight and fade, labels, selection, graph/list view, graph framing, and relevant expansions as explicit serializable data. Restore through the same view-state contract instead of relying on the capturing browser's transient state.`,
    text`App Places include active tabs within tabbed modals as well as the page and modal. Audit existing tab support rather than assume all tabs are missing; preview already has a tab parameter.`,
    text`Required checkpoint interactions include the unresolved configuration-conflict modal, the depth-change/new-sources confirmation, unresolved sensitivity confirmation, and identity review with partial decisions. Restore into a fresh development fork and verify it is ready for the corresponding manual action.`,
    text`Starred checkpoints and a separate starred-checkpoint table are intentionally outside this change.`,
  ],
  interplay: text`${link(id.checkpoint, 'Checkpoints')} capture ${link(id.sourceReviewViewState, 'Mode View State')} and ${link(id.appPlace, 'App Places')}. ${link(id.savedState, 'Saved States')} provide the fresh QA fork.`,
});

export const conceptImplementationNavigation = define({
  id: id.conceptImplementationNavigation, name: 'Concept Implementation Navigation', kind: 'capability', searchFacet: true,
  definition: text`Proposed: concept pages derive reverse navigation to the implementation symbols that participate in each declared concept and role.`,
  mechanics: [
    text`Derive Implemented by entries from existing inline, type-only MeadowConceptParticipations declarations. Each entry identifies the exact concept, role, symbol, file, and location and opens that implementation. Do not maintain duplicate manual reverse-link tables or import concept metadata into production at runtime.`,
    text`Proposed concepts name intended behavior but do not claim production participants before implementation exists. Acceptance scenarios link directly to canonical concepts and behavioral rules; empty pending declarations are design requirements, not passing evidence.`,
    text`The report's existing category Tags remain visible. Detailed concepts and behavioral rules have a caret-controlled Concepts row, closed initially, with a selected-count indicator and the same co-occurrence and selected-option-removal behavior as other filters. This filter disclosure is implemented separately from the proposed reverse navigation.`,
  ],
  interplay: text`${link(id.conceptRoleValidation, 'Exact Concept and Role Validation')} checks participation pairings. ${link(id.checkpoint, 'Checkpoint')} evidence remains associated with its scenario and captured run.`,
});

export const conceptRoleValidation = define({
  id: id.conceptRoleValidation, name: 'Exact Concept and Role Validation', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.conceptImplementationNavigation,
  definition: text`Proposed: every declared implementation role is satisfied by a participant for that exact concept and role, rather than a matching role name anywhere in the codebase.`,
  mechanics: [
    text`A role claimed for one concept cannot accidentally satisfy another concept with the same role text. Missing and misassigned participants fail validation; renamed or removed participant symbols continue to fail TypeScript checks.`,
    text`Negative checker tests cover missing pairs, wrong concepts, role-name collisions, and private or runtime-import violations. Reverse navigation and validation should use the same extracted participation identities.`,
  ],
  interplay: text`${link(id.conceptImplementationNavigation, 'Concept Implementation Navigation')} uses validated pairings for reverse links, completing the concept-to-code and code-to-concept connection.`,
});

export const proposedReviewToolingConcepts = [sourcingReviewRedesign, checkpointViewRestoration, conceptImplementationNavigation, conceptRoleValidation] as const;
