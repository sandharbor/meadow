/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../../language.js';

// Source review concepts connect the durable proposal lifecycle to its shared editor.

export const pendingSourceProposal = define({
  id: id.pendingSourceProposal, name: 'Pending Source Proposal', kind: 'artifact', searchFacet: true,
  appAreaIds: [id.bundleSourcing],
  implementationRoles: ['begin-proposal', 'save-proposal'],
  definition: text`one durable working set containing captured candidate material, proposed sourcing settings, and staged curation and filter decisions, awaiting acceptance or discard.`,
  mechanics: [
    text`Curation and generation continue from accepted material and saved configuration. Sourcing edits autosave into the proposal instead of requiring Save followed by Refresh sources. The proposal accumulates edits; individual tweaks do not need separate historical versions.`,
    text`Later preserves the proposal across navigation and restart while permitting further accepted curation work. Discard removes draft settings, decisions, and candidate state without modifying external source files or reverting unrelated accepted edits. Later source checks can rediscover those external changes.`,
    text`The proposal includes node configuration, traversal and source settings, tracking, bundle-local filters, global filter definitions, and related persistent policy. View-only filtering does not become a business decision. Global drafts affect this proposal's preview until acceptance; other bundles continue using saved policy.`,
    text`First capture retains the existing automatic initial acceptance and required-root tracking behavior. Other admitted pages remain available for curation. Later acceptance also permits untracked pages; the existing preview warning continues to expose unresolved curation decisions.`,
    text`Acceptance closes the working proposal, returns to curation, and records a coherent source session in Git. Historical decisions can be inspected but cannot be reopened as that completed proposal; correcting them requires new work.`,
  ],
  interplay: text`${link(id.sourceSnapshot, 'Source Snapshots')} supply immutable material. ${link(id.proposalConfigurationDraft, 'Proposal Configuration Drafts')} keep edits separate. ${link(id.pendingProposalRevalidation, 'Pending Proposal Revalidation')} protects later work. ${link(id.sourceReviewWorkspace, 'Source Review Workspace')} provides the review interface.`,
});

export const proposalConfigurationDraft = define({
  implementationRoles: ['stage-configuration', 'summarize-draft'],
  id: id.proposalConfigurationDraft, name: 'Proposal Configuration Draft', kind: 'artifact', searchFacet: true,
  parentId: id.pendingSourceProposal, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  definition: text`proposed configuration changes isolated from accepted node, bundle-filter, and global-filter settings until the source proposal is accepted.`,
  mechanics: [
    text`Reuse the existing separate node-configuration draft pattern rather than applying accepted edits and attempting to reverse them. Each configuration type keeps its own validation; the proposal coordinates preservation, discard, merging, and atomic application.`,
    text`Retain the original value and the proposed value for each edited setting or filter so later accepted changes can be compared. Additions, deletions, enablement, and changes of filter scope participate too; do not replace an entire global-filter document and lose unrelated edits.`,
    text`Global edits remain available in sourcing. The editor states that the definition applies to all bundles in both sourcing and curation, pending acceptance of this proposal. Accept applies those shared edits; Discard removes them. Per-mode view choices remain separate.`,
    text`The sourcing header contains an expandable proposal summary, beside Accept and Later, with counts of settings and tracking changes. Expanded entries show before and after values. This complements graph-based source review and is not a second per-page approval gate.`,
  ],
  interplay: text`${link(id.sourceReviewConfigurationMerge, 'Proposal Configuration Merge')} resolves competing saved edits. ${link(id.sourceReviewAcceptance, 'Proposal Acceptance')} applies validated drafts with the captured material.`,
});

export const pendingProposalRevalidation = define({
  implementationRoles: ['review-proposal'],
  id: id.pendingProposalRevalidation, name: 'Pending Proposal Revalidation', kind: 'process', searchFacet: true,
  parentId: id.pendingSourceProposal, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  definition: text`when relevant state outside a pending proposal changes, reassess whether its staged decisions remain applicable before carrying them forward or accepting them.`,
  mechanics: [
    text`Newer live material and newer accepted curation decisions are distinct causes. Detecting live changes preserves the reviewed candidate until an explicit update; reopening a deferred proposal uses current accepted curation and sensitivity policy while retaining its captured source material.`,
    text`Preserve compatible decisions and unrelated changes automatically. Surface changed targets, conflicting settings, mutually exclusive inclusion decisions, and newly sensitive tracking choices. Unresolved decisions block acceptance, and a final validation prevents changes made after review from being silently overwritten.`,
    text`Example: stage untracking, choose Later, blacklist the same page in curation, track an unrelated page, and restart. Reopening exposes the conflict; resolution and acceptance preserve the unrelated edit.`,
    text`Example: stage tracking, choose Later, enable a sensitivity filter in curation, and reopen. Automatic choices become untracked where appropriate; explicit tracking choices that became sensitive require renewed confirmation.`,
  ],
  interplay: text`${link(id.sourceChangesDuringReview, 'Source Changes During Review')} handles newer filesystem material. ${link(id.sourceReviewConfigurationMerge, 'Proposal Configuration Merge')} handles newer saved settings. ${link(id.sourceReviewSensitivity, 'Proposal Tracking Sensitivity')} handles changed effective sensitivity.`,
});

export const sourceReviewConfigurationMerge = define({
  id: id.sourceReviewConfigurationMerge, name: 'Proposal Configuration Merge', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.pendingProposalRevalidation, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  implementationRoles: ['merge-configuration'],
  definition: text`merge a proposal against its original and current saved values without silently overwriting subsequent configuration changes.`,
  mechanics: [
    text`If current equals original, apply the proposed value. If current already equals proposed, no conflict exists. Preserve independent edits, including separate fields of the same page or filter. Divergent changes to the same setting, deletions versus edits, and semantically incompatible decisions require an explicit choice.`,
    text`Recheck against current saved state at acceptance. Conflict resolution shows the original, saved, and proposed alternatives and does not silently make a fresh external edit disappear.`,
  ],
  interplay: text`The ${link(id.proposalConfigurationDraft, 'Proposal Configuration Draft')} retains comparison values. ${link(id.pendingProposalRevalidation, 'Pending Proposal Revalidation')} supplies the broader applicability checks.`,
});

export const sourceReviewTrigger = define({
  implementationRoles: ['route-blacklist-edit'],
  id: id.sourceReviewTrigger, name: 'Sourcing Review Trigger', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.pendingSourceProposal, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  definition: text`reviewing source changes or making a boundary edit requiring review enters sourcing with an isolated pending proposal.`,
  mechanics: [
    text`Review source changes replaces the existing source-changes modal as the main review entry. Depth and traversal edits, and blacklisting or unblacklisting with wider graph effects, stage their effects and enter sourcing. A compact transition explanation makes the mode change explicit.`,
    text`For page and folder blacklist shortcuts in curation, calculate actual full-graph consequences rather than infer them from visible descendants or an apparent leaf. When only the selected item changes and no other pages enter or leave scope, apply immediately with Undo. Otherwise stage the edit. Independent routes can retain pages, while a folder or page stop can remove pages outside its subtree.`,
    text`Once in sourcing, even a simple leaf blacklist belongs to the pending proposal. When a boundary rebuild would incorporate newer live material, request explicit confirmation before applying it; cancellation leaves both the old candidate and setting intact. Identity decisions are resolved before the sourcing graph becomes available.`,
  ],
  interplay: text`${link(id.sourceReviewIdentity, 'Source Review Identity')} gates graph entry. ${link(id.sourceChangesDuringReview, 'Source Changes During Review')} governs refresh consent. ${link(id.blacklist, 'Blacklisting')} and ${link(id.overrides, 'Traversal Overrides')} supply boundary edits.`,
});

export const sourceReviewIdentity = define({
  implementationRoles: ['choose-identities'],
  id: id.sourceReviewIdentity, name: 'Source Review Identity', kind: 'process', searchFacet: true,
  parentId: id.pendingSourceProposal, appAreaIds: [id.bundleSourcing],
  definition: text`resolve whether proposed source matches preserve page identity before entering the sourcing comparison graph.`,
  mechanics: [
    text`A required modal shows potential renames and moves with existing matching evidence and choices to preserve identity or treat files as separate pages. Continue to graph stores resolved decisions in the proposal without accepting sources. Later or closing returns to curation and preserves partial decisions; unresolved identity prevents entry into sourcing.`,
    text`Offer an explicit bulk confirmation of all unambiguous suggestions, with counts and evidence available. Ambiguous matches require individual choices. A confirmed match appears as one comparison node with old and new locations and routes. Rejected matches become separate additions and departures.`,
    text`Review identities can reopen these decisions while the proposal is pending, including after Later. Changing identity rebuilds the comparison and revalidates affected decisions. Refreshes that introduce unresolved identities require the gate again. After acceptance, historical identity decisions cannot be reopened or rewritten.`,
  ],
  interplay: text`${link(id.sourceMove, 'Source Move')} supplies correspondence evidence; ${link(id.bundleNodeId, 'Bundle Node Identity')} identifies preserved configuration. ${link(id.pendingProposalRevalidation, 'Pending Proposal Revalidation')} handles decisions whose targets changed.`,
});

export const sourceReviewAcceptance = define({
  id: id.sourceReviewAcceptance, name: 'Proposal Acceptance', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.pendingSourceProposal, appAreaIds: [id.bundleSourcing],
  implementationRoles: ['apply-transaction', 'recover-transaction'],
  definition: text`accept exactly the reviewed source capture and resolved proposal configuration as one recoverable transaction.`,
  mechanics: [
    text`Accept applies all additions, modifications, departures, proposed settings, staged tracking and filter edits, and required cleanup together. It is not a separate approval of each ordinary source change. View filters neither select changes for acceptance nor erase pending decisions.`,
    text`Newer live material does not prevent accepting the currently reviewed capture, and acceptance never rereads newer file bytes. Source tracking and sensitivity assessment use the same reviewed capture and resolved policy. An admitted page can remain untracked after acceptance.`,
    text`Validate identities, conflicts, required entries, and renewed sensitivity choices before committing. A failed or interrupted application leaves or restores the preceding accepted state and preserves a recoverable pending proposal; a Git commit alone is not a substitute for coordinated application and recovery.`,
    text`Success returns to curation with its remembered view settings and removes pending styling. The source session is complete; historical inspection does not reopen that proposal.`,
  ],
  interplay: text`${link(id.sourceReviewCleanup, 'Accepted Scope Cleanup')} governs removed configuration. ${link(id.proposalConfigurationDraft, 'Proposal Configuration Drafts')} and ${link(id.sourceSnapshot, 'Source Snapshots')} are applied together.`,
});

export const sourceReviewCleanup = define({
  implementationRoles: ['clean-accepted-scope'],
  id: id.sourceReviewCleanup, name: 'Accepted Scope Cleanup', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.pendingSourceProposal, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  definition: text`retain excluded pages' configuration while a proposal is pending and remove unreachable configuration when it is accepted.`,
  mechanics: [
    text`Reversing a draft blacklist or depth reduction restores excluded pages with their configuration, including across Later and restart. These provisional exclusions are not permanent cleanup.`,
    text`Acceptance requires cleanup for both intentional scope exclusions and external-source orphans. Remove Keep in config exceptions. Retain causal blacklist and traversal controls; cleanup must not undo the boundary itself. Required starting and traversal entries block acceptance until repaired rather than being removed implicitly. Source files remain untouched.`,
    text`Re-expanding after acceptance brings pages back with fresh curation decisions. Historical Git data does not turn a completed source session into an ordinary reversible draft.`,
  ],
  interplay: text`${link(id.orphan, 'Orphaned Configuration')} identifies cleanup needs independently of the disappearance cause. ${link(id.sourceReviewIdentity, 'Source Review Identity')} separates confirmed moves from departures.`,
});

export const sourceReviewWorkspace = define({
  implementationRoles: ['render-workspace', 'compare-captures'],
  id: id.sourceReviewWorkspace, name: 'Source Review Workspace', kind: 'capability', searchFacet: true,
  parentId: id.pendingSourceProposal, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  definition: text`sourcing is an explicitly marked mode of the full graph editor, combining candidate exploration and accepted-versus-proposed comparison.`,
  mechanics: [
    text`Keep the full canvas, graph and list views, existing selection/sidebar machinery, and complete filtering, solo, hide, labels, and inspection tools. A persistent sourcing header with Accept, Later, and Discard and a cohesive sourcing accent distinguish the mode. Start with ordinary filter groups visible below the prominent Source changes group; refine colors and layout through a prototype.`,
    text`The comparison includes candidate nodes plus departing accepted nodes and their previous connections. Departures remain clearly marked and inspectable rather than disappearing or fading into unchanged context. Confirmed moves use one identity with before and after locations.`,
    text`Source changes exposes Added, Modified, No longer included, Renames and moves, Orphaned configuration, and Unchanged. No longer included expands into Source missing and No longer reachable; orphaned configuration is an additional badge/filter rather than a mutually exclusive cause. Absence from a snapshot is not proof of filesystem deletion, and a disconnected source is not classified as deleted.`,
    text`Hover in graph and list gives a short explanation. Selected-node sourcing details give paths, previous and proposed routes, broken connections or responsible traversal settings, sensitivity, and content comparison. Reuse the existing route diagnosis and evidence; details and acceptance refer to captured material rather than silently substituting newer live sources. Diffs remain focused dialogs.`,
    text`Sourcing can be entered without pending file changes to explore the frontier and boundary. Curation operates within accepted material and retains its Untracked filter and preview warning. Frontier exploration belongs in sourcing; returning to curation preserves its accepted-material context.`,
    text`Track selected operates on eligible candidate pages and explicitly reports departing comparison nodes it skips. No longer included nodes cannot be tracked into the proposed graph. An existing Untracked filter evaluates proposed tracking immediately; there is no extra Staged decision graph category. Settings and tracking edits remain inspectable in the expandable header summary.`,
  ],
  interplay: text`${link(id.sharedSourcingCuration, 'Shared Sourcing and Curation')} owns reusable editor behavior. ${link(id.sourceReviewFiltering, 'Source Review Filtering')} and ${link(id.sourceReviewViewState, 'Mode View State')} preserve the existing tools.`,
});

export const sourceReviewFiltering = define({
  implementationRoles: ['define-change-filters'],
  id: id.sourceReviewFiltering, name: 'Source Review Filtering', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.sourceReviewWorkspace, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  definition: text`source-change filters change presentation only and combine with existing graph filters without changing the accepted proposal.`,
  mechanics: [
    text`Hide, solo, highlight, category toggles, and fade never reject source changes, undo tracking choices, or omit changes from acceptance. Source categories remain combinable with folders and ordinary filters. Unchanged defaults to Fade; changed categories have distinguishable treatments with readable explanations.`,
    text`Soloing a group brings matching nodes to full visibility even when they match Fade. Leaving solo restores the underlying fade setting instead of rewriting it. Faded context remains available for selection and inspection.`,
  ],
  interplay: text`${link(id.filters, 'Filters')} supply the normal toolkit. ${link(id.graphFade, 'Graph Fade')} supplies the general presentation action. ${link(id.sourceReviewAcceptance, 'Proposal Acceptance')} remains independent of visibility.`,
});

export const graphFade = define({
  implementationRoles: ['apply-filter-presentation'],
  id: id.graphFade, name: 'Graph Fade', kind: 'mechanism', searchFacet: true,
  appAreaIds: [id.bundleCuration, id.bundleSourcing],
  definition: text`a reusable graph-filter action that reduces the prominence of matching context without hiding it or changing business state.`,
  mechanics: [
    text`Fade is a general filter action alongside highlighting, not a hard-coded sourcing-only opacity rule. In sourcing, the Unchanged subfilter uses it by default. Opacity, color, and optional marker patterns are prototype choices; labels and selection remain usable.`,
    text`Solo temporarily brings its targets into focus while retaining the remembered fade configuration. Fade and its current effective presentation are included in restorable per-mode view state.`,
  ],
  interplay: text`${link(id.sourceReviewFiltering, 'Source Review Filtering')} uses Fade for unchanged comparison context. ${link(id.sourceReviewViewState, 'Mode View State')} remembers the action separately from proposal decisions.`,
});

export const sourceReviewViewState = define({
  implementationRoles: ['remember-mode-view'],
  id: id.sourceReviewViewState, name: 'Mode View State', kind: 'state', searchFacet: true,
  parentId: id.sourceReviewWorkspace, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  definition: text`independently remembered, serializable presentation state for sourcing and curation in the same graph editor.`,
  mechanics: [
    text`Each mode remembers filters and filter mix, group expansion, highlight and fade, solo and hidden sets, labels and titles, selection, graph/list view, and graph pan and zoom. The first sourcing view shows the full comparison with unchanged faded rather than inheriting a curation solo that hides additions.`,
    text`Mode transitions restore the target mode's view. Successful acceptance returns to the remembered curation view of the accepted graph. Sensitivity and persistent filter definitions remain policy, not duplicated per-mode settings.`,
    text`Checkpoint data explicitly captures both mode states plus the active mode. A fresh Dev Tools fork restores that state, the active App Place, open modal, and active modal tab so manual testing starts at the same interaction.`,
  ],
  interplay: text`${link(id.checkpointViewRestoration, 'Checkpoint View Restoration')} makes the presentation portable. ${link(id.proposalConfigurationDraft, 'Proposal Configuration Draft')} owns business edits separately.`,
});

export const sourceReviewSensitivity = define({
  id: id.sourceReviewSensitivity, name: 'Proposal Tracking Sensitivity', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.pendingProposalRevalidation, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  implementationRoles: ['revalidate-tracking'],
  definition: text`provisional tracking uses effective sensitivity and requires renewed approval when an explicit tracking choice becomes sensitive.`,
  mechanics: [
    text`Retain the saved Track non-sensitive added pages preference, display its provisional effects, and allow individual opt-outs. Effective sensitivity includes source markings and enabled bundle or global Mark Sensitive filters. Sensitive additions are admitted to candidate material but are not automatically tracked.`,
    text`Refreshing source material or reopening after accepted policy changes reassesses provisional tracking. Newly sensitive automatic choices become untracked. Explicit choices that became sensitive must be confirmed again or untracked before acceptance.`,
    text`The filesystem-change and deferred-policy-change scenarios both reference Pending Proposal Revalidation and sensitivity concepts; only the filesystem scenario additionally references Source Changes During Review. Checkpoints preserve the unresolved review, not merely a screenshot.`,
  ],
  interplay: text`${link(id.sensitive, 'Sensitive Bundle Pages')} and ${link(id.filterSensitivity, 'Filter-Derived Sensitivity')} determine effective sensitivity. ${link(id.pendingProposalRevalidation, 'Pending Proposal Revalidation')} guards carried-forward decisions.`,
});

export const proposedSourceReviewConcepts = [
  pendingSourceProposal, proposalConfigurationDraft, pendingProposalRevalidation,
  sourceReviewConfigurationMerge, sourceReviewTrigger, sourceReviewIdentity,
  sourceReviewAcceptance, sourceReviewCleanup, sourceReviewWorkspace,
  sourceReviewFiltering, graphFade, sourceReviewViewState, sourceReviewSensitivity,
] as const;
