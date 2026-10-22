/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../language.js';

export const checkpointViewRestoration = define({
  implementationRoles: ['capture-view', 'restore-view'],
  id: id.checkpointViewRestoration, name: 'Checkpoint View Restoration', kind: 'capability', searchFacet: true,
  parentId: id.checkpoint,
  definition: text`a checkpoint restores the precise editor and dialog interaction state in a fresh Dev Tools fork, including both sourcing and curation views.`,
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
  implementationRoles: ['extract-identities', 'render-navigation'],
  definition: text`concept pages derive reverse navigation to the implementation symbols that participate in each declared concept and role.`,
  mechanics: [
    text`Derive Implemented by entries from existing inline, type-only MeadowConceptParticipations declarations. Each entry identifies the exact concept, role, symbol, file, and location and opens that implementation. Do not maintain duplicate manual reverse-link tables or import concept metadata into production at runtime.`,
    text`Proposed concepts name intended behavior but do not claim production participants before implementation exists. Acceptance scenarios link directly to canonical concepts and behavioral rules; empty pending declarations are design requirements, not passing evidence.`,
    text`The report's existing category Tags remain visible. Detailed concepts and behavioral rules have a caret-controlled Concepts row, closed initially, with a selected-count indicator and the same co-occurrence and selected-option-removal behavior as other filters. This filter disclosure is implemented separately from the proposed reverse navigation.`,
    text`A selected concept opens its details and implementation inside the run report, embedded, in an adjustable right sidebar, or in a movable and resizable floating panel. Related-concept and implementation links navigate inside that panel without changing scenario filters. Back navigation and returning to the selected concept preserve the review context.`,
    text`While browsing concept details, show whether the displayed concept is selected. Select makes it the only selected concept; Add to selection keeps existing concept selections. These actions preserve other run filters and the displayed details.`,
  ],
  interplay: text`${link(id.conceptRoleValidation, 'Exact Concept and Role Validation')} checks participation pairings. ${link(id.checkpoint, 'Checkpoint')} evidence remains associated with its scenario and captured run.`,
});

export const conceptRoleValidation = define({
  id: id.conceptRoleValidation, name: 'Exact Concept and Role Validation', kind: 'behavioral-rule', searchFacet: false,
  implementationRoles: ['validate-pairs'],
  parentId: id.conceptImplementationNavigation,
  definition: text`every declared implementation role is satisfied by a participant for that exact concept and role, rather than a matching role name anywhere in the codebase.`,
  mechanics: [
    text`A role claimed for one concept cannot accidentally satisfy another concept with the same role text. Missing and misassigned participants fail validation; renamed or removed participant symbols continue to fail TypeScript checks.`,
    text`Negative checker tests cover missing pairs, wrong concepts, role-name collisions, and private or runtime-import violations. Reverse navigation and validation should use the same extracted participation identities.`,
  ],
  interplay: text`${link(id.conceptImplementationNavigation, 'Concept Implementation Navigation')} uses validated pairings for reverse links, completing the concept-to-code and code-to-concept connection.`,
});

export const areaBoundaryMap = define({
  id: id.areaBoundaryMap, name: 'Area Boundary Map', kind: 'capability', searchFacet: false,
  implementationRoles: ['read-boundaries', 'describe-code', 'render-map'] as const,
  definition: text`A documentation view of the public interfaces and shared declarations connecting Sourcing, Curation, Generation, Review, and Sharing.`,
  mechanics: [
    text`Public API entries come from explicit exported.ts declarations and identify both the providing area and the permitted caller. Bundles and App Shell remain named participants outside the five lifecycle lanes.`,
    text`Shared types, runtime values, and capabilities appear only when resolved symbol references connect multiple lifecycle areas. Import aliases and dependencies between shared declarations retain their original symbol identity. Shared Sourcing and Curation participates in both editor areas.`,
    text`Data and artifact lanes link to canonical concept documents, whose declared area associations explain the durable information flowing between areas. Runtime value declarations do not claim to trace persisted reads and writes.`,
    text`Code reference pages expose current declarations and consumer locations. Higher-level explanations link to stable concept identities through checked, inline participation declarations. Concepts can have several implementing symbols across files; moving those symbols does not change the concept link.`,
    text`The map reads the current checkout independently of captured run documentation. Refresh rereads the checkout; reference pages briefly reuse that index; historical prose stays associated with its original recording.`,
  ],
  interplay: text`${link(id.bundle, 'Bundle areas')} define the narrow-interface policy. ${link(id.conceptImplementationNavigation, 'Concept Implementation Navigation')} connects stable ideas to current code; ${link(id.sourceSnapshot, 'Source Snapshots')} and ${link(id.generationRecord, 'Generation Records')} illustrate durable data boundaries.`,
});

export const proposedReviewToolingConcepts = [checkpointViewRestoration, conceptImplementationNavigation, conceptRoleValidation, areaBoundaryMap] as const;
