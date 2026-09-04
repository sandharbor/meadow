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
  appAreaIds: [coreConceptIds.bundles],
  definition: conceptText`The mutable, human-readable name used for a bundle's local folder, list label, editor route, and command argument.`,
  mechanics: [conceptText`Renaming preserves the bundle's stable GUID. If the bundle was generated, its output is regenerated because generation hooks receive the slug.`],
  interplay: conceptText`A bundle slug is independent of provider-specific addresses recorded by ${conceptLink(coreConceptIds.publicationRevision, "Publication Revisions")}.`,
});

export const findInBundles = defineMeadowConcept({
  id: coreConceptIds.findInBundles,
  name: "Find in Bundles",
  kind: "capability",
  appAreaIds: [coreConceptIds.bundles],
  definition: conceptText`The capability for locating a source page across every bundle that includes or references it.`,
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
  appAreaIds: [coreConceptIds.bundles, coreConceptIds.bundleCuration],
  definition: conceptText`A bundle whose initial structure is derived from one selected folder or an ordered collection of folders.`,
  mechanics: [
    conceptText`Folder roots drive recursive structural discovery, explicit-root tracking, and generated folder or collection home pages.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.folderFilter, "Source Folder Filter")} controls source-folder visibility, while ordinary ${conceptLink(coreConceptIds.tracking, "Bundle Page Tracking")} rules still determine which discovered pages enter the bundle.`,
});

export const multiBundle = defineMeadowConcept({
  id: coreConceptIds.multiBundle,
  name: "Multi-Bundle Management",
  aliases: ["Multi-Bundle"],
  kind: "capability",
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
  multiBundle,
  cli,
] as const;
