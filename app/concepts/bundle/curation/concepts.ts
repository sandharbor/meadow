/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { coreConceptIds } from "../../ids.js";
import { conceptLink, conceptText, defineMeadowConcept } from "../../language.js";

const curationArea = [coreConceptIds.bundleCuration] as const;

export const blacklist = defineMeadowConcept({
  id: coreConceptIds.blacklist,
  name: "Bundle Page Blacklisting",
  aliases: ["Blacklist"],
  kind: "mechanism",
  appAreaIds: curationArea,
  definition: conceptText`The explicit exclusion of a source page or source-folder subtree from a bundle.`,
  mechanics: [
    conceptText`A page blacklist is local and non-transitive; a folder blacklist is a hard subtree boundary.`,
    conceptText`Removing the blacklist restores pages that remain reachable under the bundle's other constraints.`,
  ],
  interplay: conceptText`Blacklisting constrains ${conceptLink(coreConceptIds.tracking, "Bundle Page Tracking")} and protects the generated graph before ${conceptLink(coreConceptIds.htmlGeneration, "HTML Bundle Generation")}.`,
});

export const bundleConfig = defineMeadowConcept({
  id: coreConceptIds.bundleConfig,
  name: "Bundle Page Configuration",
  aliases: ["Bundle Config"],
  kind: "artifact",
  appAreaIds: curationArea,
  definition: conceptText`The durable per-page configuration that records a bundle page's tracking and traversal choices.`,
  mechanics: [
    conceptText`Simple operations can save immediately, while compound depth or bulk changes remain a draft until explicitly saved.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.overrides, "Page Configuration Overrides")} exposes pages whose settings differ from bundle defaults; ${conceptLink(coreConceptIds.initialPage, "Initial Bundle Page")} has additional invariants.`,
});

export const callout = defineMeadowConcept({
  id: coreConceptIds.callout,
  name: "Callout",
  kind: "interface",
  appAreaIds: curationArea,
  definition: conceptText`A contextual message or action surface that textually explains a system condition requiring attention.`,
  mechanics: [
    conceptText`A callout remains tied to the condition that produced it and offers only actions that can resolve or inspect that condition.`,
  ],
  interplay: conceptText`Callouts surface conditions such as ${conceptLink(coreConceptIds.orphan, "Orphaned Bundle Pages")}, ${conceptLink(coreConceptIds.sensitive, "Sensitive Bundle Pages")}, untracked pages before generation, and failures handled by ${conceptLink(coreConceptIds.startupRecovery, "Safe Startup Recovery")}.`,
});

export const filters = defineMeadowConcept({
  id: coreConceptIds.filters,
  name: "Custom Filter",
  aliases: ["Filters", "Filter"],
  kind: "mechanism",
  appAreaIds: curationArea,
  definition: conceptText`A reusable rule that selects and optionally acts on matching pages in the curation graph.`,
  mechanics: [
    conceptText`Filters can be created, combined into a filter mix, viewed alone, and evaluated against changing page data.`,
  ],
  interplay: conceptText`Specialized filters expose ${conceptLink(coreConceptIds.frontier, "Frontier Bundle Pages")}, ${conceptLink(coreConceptIds.sensitive, "Sensitive Bundle Pages")}, ${conceptLink(coreConceptIds.overrides, "Page Configuration Overrides")}, and ${conceptLink(coreConceptIds.linkGap, "In-Link Gaps")}.`,
});

export const folderFilter = defineMeadowConcept({
  id: coreConceptIds.folderFilter,
  name: "Source Folder Filter",
  aliases: ["Folder Filter"],
  kind: "interface",
  appAreaIds: curationArea,
  definition: conceptText`The hierarchical filter for focusing curation on selected source folders.`,
  mechanics: [
    conceptText`It presents recursive page counts, nested activity, title filtering, soloing, hiding, and reset behavior.`,
  ],
  interplay: conceptText`It changes the visible source scope without itself changing ${conceptLink(coreConceptIds.tracking, "Bundle Page Tracking")} or the structure of a ${conceptLink(coreConceptIds.folderBundles, "Folder-Derived Bundle")}.`,
});

export const frontier = defineMeadowConcept({
  id: coreConceptIds.frontier,
  name: "Frontier Bundle Page",
  aliases: ["Frontier", "Frontier Bundle Pages"],
  kind: "state",
  appAreaIds: curationArea,
  definition: conceptText`A reachable page just beyond the bundle's current traversal boundary.`,
  mechanics: [
    conceptText`Frontier depth and frontier-focused filtering explain how the graph would expand if the boundary moved.`,
    conceptText`A frontier image extension remains directly trackable so an image referenced at the boundary can be preserved without expanding ordinary page traversal.`,
  ],
  interplay: conceptText`An ordinary frontier page is visible for boundary reasoning but cannot become a ${conceptLink(coreConceptIds.tracking, "tracked bundle page")} until the graph constraints admit it; frontier image extensions are the deliberate exception.`,
});

export const initialPage = defineMeadowConcept({
  id: coreConceptIds.initialPage,
  name: "Initial Bundle Page",
  aliases: ["Initial Page"],
  kind: "entity",
  appAreaIds: curationArea,
  definition: conceptText`The depth-zero page that establishes the root of a page-derived bundle graph.`,
  mechanics: [
    conceptText`It cannot be untracked, blacklisted, or stripped of the constraints required to keep the bundle graph valid.`,
  ],
  interplay: conceptText`Its depth settings belong to the base bundle configuration rather than ${conceptLink(coreConceptIds.overrides, "Page Configuration Overrides")}.`,
});

export const labels = defineMeadowConcept({
  id: coreConceptIds.labels,
  name: "Graph Title Labels",
  aliases: ["Show Titles"],
  kind: "interface",
  appAreaIds: curationArea,
  definition: conceptText`The graph overlay that displays page titles for nodes selected by a filter.`,
  mechanics: [
    conceptText`Each filter can request labels for its matches without changing which pages the filter selects.`,
  ],
  interplay: conceptText`Title labels explain the result of a ${conceptLink(coreConceptIds.filters, "Custom Filter")} without changing bundle membership or graph traversal.`,
});

export const linkGap = defineMeadowConcept({
  id: coreConceptIds.linkGap,
  name: "In-Link Gap",
  aliases: ["Link Gap"],
  kind: "mechanism",
  appAreaIds: curationArea,
  definition: conceptText`A measured difference between a page's source-graph in-links and the in-links represented in its bundle graph.`,
  mechanics: [
    conceptText`The in-link-gap filter calculates a useful threshold and identifies pages whose missing context may deserve review.`,
  ],
  interplay: conceptText`It is a specialized ${conceptLink(coreConceptIds.filters, "Custom Filter")} that reveals structural omissions rather than directly expanding the graph.`,
});

export const links = defineMeadowConcept({
  id: coreConceptIds.links,
  name: "Bundle Page Links",
  aliases: ["Links"],
  kind: "interface",
  appAreaIds: curationArea,
  definition: conceptText`The in-link and out-link relationships shown for a selected bundle page.`,
  mechanics: [
    conceptText`The link surface supports page-to-page navigation and distinguishes destinations absent from the current graph.`,
  ],
  interplay: conceptText`Link inspection explains ${conceptLink(coreConceptIds.paths, "Curation Paths")} and can expose pages that lie at the ${conceptLink(coreConceptIds.frontier, "Frontier")}.`,
});

export const orphan = defineMeadowConcept({
  id: coreConceptIds.orphan,
  name: "Orphaned Bundle Page",
  aliases: ["Orphan", "Orphaned Bundle Pages"],
  kind: "state",
  appAreaIds: curationArea,
  definition: conceptText`A page with durable bundle configuration that is no longer reachable in the current working graph.`,
  mechanics: [
    conceptText`Orphan review identifies the stale configuration and offers explicit removal rather than silently discarding it.`,
  ],
  interplay: conceptText`A ${conceptLink(coreConceptIds.callout, "Curation Callout")} makes the inconsistency visible while preserving reviewability of the configured state.`,
});

export const overrides = defineMeadowConcept({
  id: coreConceptIds.overrides,
  name: "Page Configuration Override",
  aliases: ["Overrides", "Override"],
  kind: "state",
  appAreaIds: curationArea,
  definition: conceptText`A per-page traversal setting that differs from the bundle's default configuration.`,
  mechanics: [
    conceptText`The Overrides filter highlights affected pages and excludes the initial page's base settings.`,
  ],
  interplay: conceptText`Overrides are stored in ${conceptLink(coreConceptIds.bundleConfig, "Bundle Page Configuration")} and alter the graph boundary that produces ${conceptLink(coreConceptIds.frontier, "Frontier Bundle Pages")}.`,
});

export const paths = defineMeadowConcept({
  id: coreConceptIds.paths,
  name: "Curation Path",
  aliases: ["Paths", "Curation Paths"],
  kind: "mechanism",
  appAreaIds: curationArea,
  definition: conceptText`A structural or traversal route that explains how Meadow reached a page in the working graph.`,
  mechanics: [
    conceptText`Path-oriented workflows select relevant routes and expose the sequence of relationships leading to a node.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.links, "Bundle Page Links")} provide the local edges; curation paths assemble those edges into an explanation of reachability.`,
});

export const sensitive = defineMeadowConcept({
  id: coreConceptIds.sensitive,
  name: "Sensitive Bundle Page",
  aliases: ["Sensitive", "Sensitive Bundle Pages"],
  kind: "state",
  appAreaIds: curationArea,
  definition: conceptText`A page marked as requiring protection from casual inclusion in a bundle.`,
  mechanics: [
    conceptText`Sensitive pages are excluded from bulk tracking and remain available for deliberate, page-specific review.`,
  ],
  interplay: conceptText`Sensitivity constrains ${conceptLink(coreConceptIds.tracking, "Bundle Page Tracking")} and is surfaced through ${conceptLink(coreConceptIds.filters, "Custom Filters")} and ${conceptLink(coreConceptIds.callout, "Curation Callouts")}.`,
});

export const sourceGraphSearch = defineMeadowConcept({
  id: coreConceptIds.sourceGraphSearch,
  name: "Source Graph Search",
  kind: "capability",
  appAreaIds: curationArea,
  definition: conceptText`The capability for locating source pages by title while curating a bundle graph.`,
  mechanics: [
    conceptText`Search narrows graph-visible pages and supports navigation to the matching source-page context.`,
  ],
  interplay: conceptText`It searches the editable source graph; ${conceptLink(coreConceptIds.generatedBundleSearch, "Generated Bundle Search")} is a distinct reader-facing capability over generated output.`,
});

export const tracking = defineMeadowConcept({
  id: coreConceptIds.tracking,
  name: "Bundle Page Tracking",
  aliases: ["Tracking"],
  kind: "mechanism",
  appAreaIds: [coreConceptIds.bundleCuration, coreConceptIds.bundleReview],
  definition: conceptText`The explicit decision that a reachable source page belongs in a bundle.`,
  mechanics: [
    conceptText`Single-page and bounded bulk tracking operations persist immediately when they do not require a compound draft.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.blacklist, "Bundle Page Blacklisting")}, ${conceptLink(coreConceptIds.sensitive, "Sensitivity")}, and graph reachability constrain which pages can be tracked; review shows the output consequences.`,
});

export const curationConcepts = [
  blacklist,
  bundleConfig,
  callout,
  filters,
  folderFilter,
  frontier,
  initialPage,
  labels,
  linkGap,
  links,
  orphan,
  overrides,
  paths,
  sensitive,
  sourceGraphSearch,
  tracking,
] as const;
