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

export const archived = defineMeadowConcept({
  id: coreConceptIds.archived,
  name: "Bundle Archiving",
  aliases: ["Archived Bundles"],
  kind: "state",
  searchFacet: true,
  appAreaIds: [coreConceptIds.bundles, coreConceptIds.bundleCuration],
  definition: conceptText`The reversible state that removes a bundle from the current collection without deleting its configuration.`,
  mechanics: [
    conceptText`Archived bundles appear in a separate collection surface and can be restored to the current set.`,
    conceptText`Cross-bundle discovery can still report matches in archived bundles.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.findInBundles, "Find in Bundles")} distinguishes archived matches so navigation does not erase the bundle's lifecycle state.`,
});

export const bundleSlug = defineMeadowConcept({
  id: coreConceptIds.bundleSlug,
  name: "Bundle Slug",
  aliases: ["Bundle Name"],
  kind: "entity",
  searchFacet: true,
  appAreaIds: [coreConceptIds.bundles],
  definition: conceptText`The mutable, human-readable name used for a bundle's local folder, list label, editor route, and command argument.`,
  mechanics: [
    conceptText`Creation presents the slug as Bundle Name and suggests it from the chosen page or folder. The published home-page title comes from the entry node and is distinct from this list name.`,
    conceptText`Renaming preserves the bundle's stable GUID. If the bundle was generated, its output is regenerated because generation hooks receive the slug.`,
  ],
  interplay: conceptText`A bundle slug is independent of provider-specific addresses recorded by ${conceptLink(coreConceptIds.publicationRevision, "Publication Revisions")}.`,
});

export const findInBundles = defineMeadowConcept({
  id: coreConceptIds.findInBundles,
  name: "Find in Bundles",
  kind: "ui-sub-area",
  searchFacet: true,
  appAreaIds: [coreConceptIds.bundles],
  definition: conceptText`The filtered bundle-list view for locating a source page across every bundle that includes or references it.`,
  mechanics: [
    conceptText`It filters the bundle collection, identifies matching current or archived bundles, and can carry the selected page into bundle navigation.`,
  ],
  interplay: conceptText`It connects source-page context to ${conceptLink(coreConceptIds.multiBundle, "Multi-Bundle Management")} while preserving ${conceptLink(coreConceptIds.archived, "Bundle Archiving")} distinctions.`,
});

export const folderBundles = defineMeadowConcept({
  id: coreConceptIds.folderBundles,
  name: "Folder-Derived Bundle",
  aliases: ["Folder-Derived Bundles"],
  kind: "entity",
  searchFacet: true,
  appAreaIds: [coreConceptIds.bundles, coreConceptIds.bundleCuration],
  definition: conceptText`A bundle whose starting structure contains a selected folder, alone or within an ordered collection of files and folders.`,
  mechanics: [
    conceptText`Folder roots drive recursive structural discovery, explicit-root tracking, and generated folder or collection home pages.`,
    conceptText`Only the selected roots are tracked at creation. Discovered descendants remain untracked, and generation publishes only tracked nodes: untracked pages and folders contribute no output, names, or links. A tracked page beneath an untracked folder is listed under its nearest published ancestor.`,
    conceptText`Creation starts with folder selection. One folder supplies its own home-page title; several folders have a collection home-page title that can be customized separately from Bundle Name.`,
    conceptText`Each selected folder must belong to a configured source. Creation checks the selection whenever folders or sources change and remains unavailable until the starting structure is valid.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.folderFilter, "Source Folder Filter")} controls source-folder visibility, while ordinary ${conceptLink(coreConceptIds.tracking, "Bundle Node Tracking")} rules still determine which discovered pages enter the bundle.`,
});

export const startingSelection = defineMeadowConcept({
  id: coreConceptIds.startingSelection, name: 'Starting Selection', kind: 'entity', searchFacet: false,
  appAreaIds: [coreConceptIds.bundles, coreConceptIds.bundleSourcing],
  definition: conceptText`A page or folder in a configured source from which a bundle's traversal begins.`,
  mechanics: [
    conceptText`The bundle owns its ordered starting selections. Several selections can come from one source or span multiple configured sources. Registering a source makes its files available but does not choose where traversal starts.`,
    conceptText`One page can traverse several sources. Several selections form an ordered collection, and each member begins with its applicable depth budget. Missing required starts require explicit setup repair; Meadow never chooses replacement pages automatically.`,
    conceptText`A selection is written as source://name followed by a source-relative path, chosen from that source's pages or page-bearing folders.`,
    conceptText`The report's Starts with pills describe these starting structures: ${conceptLink(coreConceptIds.singleFileStart, 'Single File')}, ${conceptLink(coreConceptIds.singleFolderStart, 'Single Folder')}, ${conceptLink(coreConceptIds.multipleFolderStart, 'Multiple Folders')}, and ${conceptLink(coreConceptIds.mixedStartingSelections, 'Mixed Starting Selections')}. They describe the scenario's declared structure, which may change during the scenario, rather than the number of sources or generated files.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.source, 'Sources')} bound the available filesystem inventory; the ${conceptLink(coreConceptIds.collectionNode, 'Collection Node')} groups multiple starting selections.`,
});

export const singleFileStart = defineMeadowConcept({
  id: coreConceptIds.singleFileStart, name: 'Single File', kind: 'state', searchFacet: false,
  parentId: coreConceptIds.startingSelection, appAreaIds: [coreConceptIds.bundles, coreConceptIds.bundleSourcing],
  definition: conceptText`A bundle graph that starts from one selected source page.`,
  mechanics: [
    conceptText`The selected page becomes the ${conceptLink(coreConceptIds.initialPage, 'Initial Bundle Page')}. Traversal follows its links using the bundle's depth settings and can reach pages in other configured sources. Single file describes the starting selection, not a graph restricted to one file.`,
    conceptText`The page provides the bundle's entry page. Adding another starting selection preserves the original page's identity and groups the selections under a ${conceptLink(coreConceptIds.collectionNode, 'Collection Node')}.`,
  ],
  interplay: conceptText`It is one form of ${conceptLink(coreConceptIds.startingSelection, 'Starting Selection')}. ${conceptLink(coreConceptIds.tracking, 'Bundle Node Tracking')} determines which discovered pages enter generated output.`,
});

export const singleFolderStart = defineMeadowConcept({
  id: coreConceptIds.singleFolderStart, name: 'Single Folder', kind: 'state', searchFacet: false,
  parentId: coreConceptIds.startingSelection, appAreaIds: [coreConceptIds.bundles, coreConceptIds.bundleSourcing],
  definition: conceptText`A bundle graph that starts from one selected source folder.`,
  mechanics: [
    conceptText`The folder supplies the starting structure and home-page title of a ${conceptLink(coreConceptIds.folderBundles, 'Folder-Derived Bundle')}. Meadow discovers its descendants recursively; selecting the folder does not automatically track every descendant for publication.`,
    conceptText`Adding another file or folder start creates a virtual ${conceptLink(coreConceptIds.collectionNode, 'Collection Node')} above the selections. The collection has no physical source folder, and the original folder remains a member with its own structural discovery.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.source, 'Multi-source')} supplies the source registry. A ${conceptLink(coreConceptIds.startingSelection, 'Starting Selection')} chooses a root within that registry; a source-folder visibility filter only changes the view.`,
});

export const multipleFolderStart = defineMeadowConcept({
  id: coreConceptIds.multipleFolderStart, name: 'Multiple Folders', kind: 'state', searchFacet: false,
  parentId: coreConceptIds.startingSelection, appAreaIds: [coreConceptIds.bundles, coreConceptIds.bundleSourcing],
  definition: conceptText`A bundle graph that starts from an ordered collection of selected source folders.`,
  mechanics: [
    conceptText`The selected folders may belong to one source or several configured sources. A virtual ${conceptLink(coreConceptIds.collectionNode, 'Collection Node')} groups them and provides the generated home page; it is not a directory on disk.`,
    conceptText`Each folder retains recursive structural discovery and its applicable traversal budget. Collection membership consumes no link-depth budget. Only selected roots are tracked at creation; descendants still need ${conceptLink(coreConceptIds.tracking, 'Bundle Node Tracking')} to enter generated output.`,
  ],
  interplay: conceptText`This combines several folder ${conceptLink(coreConceptIds.startingSelection, 'Starting Selections')} within a ${conceptLink(coreConceptIds.folderBundles, 'Folder-Derived Bundle')}.`,
});

export const mixedStartingSelections = defineMeadowConcept({
  id: coreConceptIds.mixedStartingSelections, name: 'Mixed Starting Selections', kind: 'state', searchFacet: false,
  parentId: coreConceptIds.startingSelection, appAreaIds: [coreConceptIds.bundles, coreConceptIds.bundleSourcing],
  definition: conceptText`A bundle starting structure that combines page and folder selections.`,
  mechanics: [
    conceptText`A virtual ${conceptLink(coreConceptIds.collectionNode, 'Collection Node')} groups the ordered selections without replacing their durable identities. It provides a generated home page and has no physical source of its own.`,
    conceptText`File members start page-link traversal; folder members retain recursive structural discovery. Each member begins with its applicable traversal budget, and collection membership itself consumes no link depth. The members may come from the same source or different configured sources.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.startingSelection, 'Starting Selection')} separates the choice of graph roots from source admission. ${conceptLink(coreConceptIds.sourceSetupEdit, 'Source Setup - Edit')} can change those selections through reviewed setup.`,
});

export const collectionNode = defineMeadowConcept({
  id: coreConceptIds.collectionNode, name: 'Collection Node', kind: 'entity', searchFacet: false,
  appAreaIds: [coreConceptIds.bundles, coreConceptIds.bundleCuration, coreConceptIds.bundleGeneration],
  definition: conceptText`A generated grouping node with ordered file or folder members and no physical source of its own.`,
  mechanics: [conceptText`Adding a second starting selection creates a collection without replacing the original page or its durable identity. Membership edges consume no link-depth budget. A reviewed collection may retain a single surviving selection, but cannot be empty or contain another collection. Folder members retain ordinary structural discovery and folder policy semantics.`],
  interplay: conceptText`Collections group ${conceptLink(coreConceptIds.startingSelection, 'Starting Selections')} and supply a generated home page. They do not admit sources or change parsed-file link semantics.`,
});

export const multiBundle = defineMeadowConcept({
  id: coreConceptIds.multiBundle,
  name: "Multi-Bundle Management",
  aliases: ["Multi-Bundle"],
  kind: "capability",
  searchFacet: true,
  appAreaIds: [coreConceptIds.bundles],
  definition: conceptText`The capability for understanding and acting across several independently configured bundles.`,
  mechanics: [
    conceptText`It keeps bundle identity explicit while supporting collection-wide discovery and navigation.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.findInBundles, "Find in Bundles")} is its primary page-centered workflow; ${conceptLink(coreConceptIds.archived, "Bundle Archiving")} changes collection visibility without merging bundle state.`,
});

export const cli = defineMeadowConcept({
  id: coreConceptIds.cli,
  name: "Meadow Command-Line Interface",
  aliases: ["Command Line Interface", "CLI"],
  kind: "interface",
  searchFacet: true,
  appAreaIds: [coreConceptIds.bundles],
  definition: conceptText`The stable machine-readable interface through which people, scripts, and agents invoke Meadow operations.`,
  mechanics: [
    conceptText`Commands authenticate to the local Runtime, return structured output, and report process or operation failures explicitly.`,
    conceptText`Generated-version and provider-specific publication-revision records expose list, read, create or plan, update, cancel, restore, and deletion operations through the same Runtime APIs as the graphical client.`,
    conceptText`Bundle renames begin with an inspectable plan and require explicit publication decisions for every provider that has published the bundle.`,
  ],
  interplay: conceptText`The interface is presented by the ${conceptLink(coreConceptIds.commandClient, "Command Client")}; it delegates all Meadow Home mutation to the ${conceptLink(coreConceptIds.runtimeService, "Runtime service")}.`,
});

export const bundleCollectionConcepts = [
  bundleSlug,
  archived,
  findInBundles,
  folderBundles,
  startingSelection,
  singleFileStart,
  singleFolderStart,
  multipleFolderStart,
  mixedStartingSelections,
  collectionNode,
  multiBundle,
  cli,
] as const;
