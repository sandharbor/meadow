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
  subAreas: [{ areaId: id.bundleSourcing, order: 1 }],
  parentId: id.pendingSourceProposal, appAreaIds: [id.bundleSourcing],
  definition: text`resolve whether proposed source matches preserve page identity before entering the sourcing comparison graph.`,
  mechanics: [
    text`A required modal shows potential renames and moves with existing matching evidence and choices to preserve identity or treat files as separate pages. Continue to graph stores resolved decisions in the proposal without accepting sources. Later or closing returns to curation and preserves partial decisions; unresolved identity prevents entry into sourcing.`,
    text`The identity modal separates Confident suggestions from Needs your input. Confident records preselect their recommended option and label it beside the radio choice; Accept all suggestions saves the remaining defaults while preserving existing decisions. Accept all suggestions remains above the scrolling records in the confident tab. The modal header uses the shared Refresh sources control to update the capture being reviewed; refresh is not a footer completion choice. Preview selection alone does not resolve an identity. Weak and competing records show the available choices without a recommendation or default, while retaining similarity and traversal evidence. The choice column retains compact dropdowns in Confident suggestions. Needs your input shows a Choose column heading in each section and directly visible Same and Different radio choices. Records with multiple possible matches show a read-only Pick in the choice column and require opening details. Each candidate has a Pick radio beside its full path and evidence, followed by Different. The column marks a selected match with a checkmark or shows Different after rejection; it never offers a competing destination chooser. Single-candidate direct choices can be saved without expanding the record. Within each tab, show Changed directories and renamed, Changed directories, then Renamed. Each section aligns a compact editable identity choice in the left column with an expandable path change in the right column. Same and Different choices can be saved without opening details; unresolved records show Choose, and competing matches require a specific destination. Multiple files sharing the same directory transition, filename edit, and guidance have a collapsed overview. Individual decisions keep that group in place and preserve its expanded state. Mixed choices appear as stacked Same, Different, and unresolved Choose lines in the left column, each with a count badge. Changing a compact choice applies only to the files counted on that line. Expanding the overview reveals individual choices and evidence. An individual file shows its full path change with a caret to open its choices and evidence. Competing destinations remain individual records. Both tabs offer an expandable overall similarity score with each criterion’s support and contribution; unavailable criteria are visibly inapplicable. Scores express heuristic evidence, not probabilities. Remember the active tab in the App Place so checkpoints restore the inspected panel. A confirmed match appears as one comparison node with old and new locations and routes. Rejected matches become separate additions and departures.`,
    text`Identity selections and group counts update immediately while durable writes are serialized against the latest proposal revision. Further choices remain available during saving; failed writes restore confirmed choices and report the error without erasing later queued edits. Continue to graph waits for saving to complete. Reuse matching evidence while captured files, traversal routes, and configured identities are unchanged; bounded result caches invalidate when those inputs change. Build the comparison graph when leaving identity review rather than after each choice. Review identities can reopen these decisions while the proposal is pending, including after Later. Changing identity rebuilds the comparison and revalidates affected decisions. Refreshes that introduce unresolved identities require the gate again. After acceptance, historical identity decisions cannot be reopened or rewritten.`,
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

export const scopeExclusion = define({
  id: id.scopeExclusion, name: 'Scope Exclusion', kind: 'state', searchFacet: false,
  parentId: id.sourceReviewCleanup, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  definition: text`a page left outside the proposed source graph by an intentional boundary change, such as blacklisting a bridge or reducing traversal depth.`,
  mechanics: [
    text`Assess the complete graph: a boundary edit can exclude other pages beyond the selected page or folder, while an independent route may keep them reachable. The exclusion concerns admitted source material; it does not delete source files.`,
    text`While the proposal is pending, retain the excluded pages' configuration. Reversing the draft boundary restores their tracking and traversal settings.`,
    text`Acceptance removes configuration that is still unreachable and retains the blacklist or traversal setting that caused the boundary. Later expansion admits returning pages untracked; it does not revive their cleaned configuration or old depth overrides.`,
    text`An externally removed link can also make configuration unreachable. Its cause is outside the proposal's intentional boundary edit, although both kinds of departure are reviewed and cleaned together.`,
  ],
  interplay: text`${link(id.blacklist, 'Blacklisting')} and ${link(id.overrides, 'Traversal Overrides')} can cause an exclusion. ${link(id.orphan, 'Orphaned Configuration')} describes the unreachable saved configuration. ${link(id.sourceReviewCleanup, 'Accepted Scope Cleanup')} governs its removal at acceptance.`,
});

export const bridgeExclusion = define({
  id: id.bridgeExclusion, name: 'Bridge Exclusion', kind: 'mechanism', searchFacet: false,
  parentId: id.scopeExclusion, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  definition: text`a scope exclusion caused by blacklisting a page that provides a traversal route to other pages.`,
  mechanics: [
    text`A bridge connects admitted pages to material beyond it. Blacklisting the bridge blocks traversal through it; pages beyond it become excluded only when no independent admitted route reaches them.`,
    text`A staged bridge exclusion is part of a pending proposal. Removing the draft blacklist restores reachable pages with their saved configuration.`,
    text`At acceptance, remove saved configuration for pages made unreachable by the exclusion while retaining the causal blacklist and leaving source files untouched. Expanding again starts fresh tracking decisions and does not restore cleaned depth overrides.`,
    text`Distinguish the boundary edit from an external source edit: removing a leaf link in the source file can make a page unreachable without blacklisting a bridge. Both causes can appear in one proposal.`,
  ],
  interplay: text`${link(id.blacklist, 'Blacklisting')} causes this form of ${link(id.scopeExclusion, 'Scope Exclusion')}. ${link(id.pendingSourceProposal, 'Pending Source Proposals')} stage the boundary; ${link(id.sourceReviewCleanup, 'Accepted Scope Cleanup')} governs the unreachable configuration.`,
});

export const sourceReviewCleanup = define({
  implementationRoles: ['clean-accepted-scope'],
  id: id.sourceReviewCleanup, name: 'Accepted Scope Cleanup', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.pendingSourceProposal, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  definition: text`retain excluded pages' configuration while a proposal is pending and remove unreachable configuration when it is accepted.`,
  mechanics: [
    text`Reversing a draft blacklist or depth reduction restores excluded pages with their configuration, including across Later and restart. These provisional exclusions are not permanent cleanup.`,
    text`Acceptance requires cleanup for both ${link(id.scopeExclusion, 'intentional scope exclusions')} and external-source orphans. Remove Keep in config exceptions. Retain causal blacklist and traversal controls; cleanup must not undo the boundary itself. Required starting and traversal entries block acceptance until repaired rather than being removed implicitly. Source files remain untouched.`,
    text`Re-expanding after acceptance brings pages back with fresh curation decisions. Historical Git data does not turn a completed source session into an ordinary reversible draft.`,
  ],
  interplay: text`${link(id.orphan, 'Orphaned Configuration')} identifies cleanup needs independently of the disappearance cause. ${link(id.sourceReviewIdentity, 'Source Review Identity')} separates confirmed moves from departures.`,
});

export const sourceReviewWorkspace = define({
  implementationRoles: ['render-workspace', 'compare-captures'],
  id: id.sourceReviewWorkspace, name: 'Source Review Workspace', kind: 'capability', searchFacet: true,
  subAreas: [{ areaId: id.bundleSourcing, order: 2 }],
  parentId: id.pendingSourceProposal, appAreaIds: [id.bundleSourcing, id.bundleCuration],
  definition: text`sourcing is an explicitly marked mode of the full graph editor, combining candidate exploration and accepted-versus-proposed comparison.`,
  mechanics: [
    text`Keep the full canvas, graph and list views, existing selection/sidebar machinery, and complete filtering, solo, hide, labels, and inspection tools. A persistent sourcing header with Accept, Later, and Discard and a cohesive sourcing accent distinguish the mode. Start with ordinary filter groups visible below the prominent Source changes group; refine colors and layout through a prototype.`,
    text`The comparison includes candidate nodes plus departing accepted nodes and their previous connections. Departures remain clearly marked and inspectable rather than disappearing or fading into unchanged context. Confirmed moves use one identity with before and after locations.`,
    text`Source changes exposes Added, Modified, No longer included, Renames and moves, Orphaned configuration, and Unchanged. No longer included expands into Source missing and No longer reachable; orphaned configuration is an additional badge/filter rather than a mutually exclusive cause. Absence from a snapshot is not proof of filesystem deletion, and a disconnected source is not classified as deleted.`,
    text`Hover in graph and list gives a short explanation. Selected-node sourcing details place a Change summary below the page name, using the Source changes category colors and a See changes action for captured content comparison. Text changes show green added-line and red removed-line counts computed from the same captured content and line comparison; binary or oversized content omits these counts. Unchanged pages have no selected-node source-change card; their ordinary details and tracking controls remain available. Added pages omit location and route comparisons and offer See content. Modified pages omit repeated locations and routes; the ordinary Details disclosure retains their path. Renames reuse the identity review’s red/green path-change presentation in a compact form: directory-only changes omit the unchanged filename, filename-only changes omit the unchanged directory, and changes to both retain both. See file content changes opens their separate content comparison. Removed pages show only removed-line counts and See previous content when their accepted capture has content. A collapsed removal Details disclosure gives the removal subtype and its filter tooltip explanation; paths and routes remain in the selected node’s Details before removal section. Reuse the existing route diagnosis and evidence; details and acceptance refer to captured material rather than silently substituting newer live sources. Diffs remain focused dialogs.`,
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
    text`Source-change filters are always enabled and have no enable checkbox. Hide, solo, highlight, and fade never reject source changes, undo tracking choices, or omit changes from acceptance. Source categories remain combinable with folders and ordinary filters. Unchanged defaults to Fade; changed categories have distinguishable treatments with readable explanations.`,
    text`The source-change categories are Added, Renamed, Modified, Removed, and Unchanged. Removed remains available to expand and always shows Source missing, Not reachable, and Disconnected, including empty subcategories, so their meanings can be compared. Other empty categories are hidden. Orphaned configuration remains explained in removal evidence rather than a separate filter. Only the removal subcategories have hover explanations, which remain fully opaque even when an empty subcategory's controls are faded.`,
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
    text`Fade is an internal filter action alongside highlighting. It is used by the Unchanged subfilter in sourcing review and is not available as a filter toolbar button or a user-created filter action. Labels and selection remain usable.`,
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
    text`Added pages start untracked. Use the ordinary Untracked filter and selection tracking controls to inspect and track them; no separate automatic tracking preference is shown. Effective sensitivity includes source markings and enabled bundle or global Mark Sensitive filters. Sensitive additions are admitted to candidate material but are not automatically tracked.`,
    text`Refreshing source material or reopening after accepted policy changes reassesses provisional tracking. Additions without an explicit tracking choice remain untracked. Explicit choices that became sensitive must be confirmed again or untracked before acceptance.`,
    text`The filesystem-change and deferred-policy-change scenarios both reference Pending Proposal Revalidation and sensitivity concepts; only the filesystem scenario additionally references Source Changes During Review. Checkpoints preserve the unresolved review, not merely a screenshot.`,
  ],
  interplay: text`${link(id.sensitive, 'Sensitive Bundle Pages')} and ${link(id.filterSensitivity, 'Filter-Derived Sensitivity')} determine effective sensitivity. ${link(id.pendingProposalRevalidation, 'Pending Proposal Revalidation')} guards carried-forward decisions.`,
});

export const proposedSourceReviewConcepts = [
  pendingSourceProposal, proposalConfigurationDraft, pendingProposalRevalidation,
  sourceReviewConfigurationMerge, sourceReviewTrigger, sourceReviewIdentity,
  sourceReviewAcceptance, scopeExclusion, bridgeExclusion, sourceReviewCleanup, sourceReviewWorkspace,
  sourceReviewFiltering, graphFade, sourceReviewViewState, sourceReviewSensitivity,
] as const;
