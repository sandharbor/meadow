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

import { coreConceptIds as id } from "../../ids.js";
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from "../../language.js";

const area = [id.bundleGeneration] as const;

export const customize = define({
  id: id.customize, name: "Bundle Customization", aliases: ["Customize"], kind: "capability", searchFacet: true, appAreaIds: area,
  definition: text`Settings that change the presentation and navigation of generated bundle output.`,
  mechanics: [
    text`Options such as breadcrumbs and backlinks are applied while ${link(id.htmlGeneration, "HTML Generation")} renders pages.`,
    text`Folder navigation has a global default-open or default-closed state, with a per-bundle override. This initial state applies until a reader opens or closes the navigation; the reader's choice is remembered separately for each bundle, including bundles on the same host.`,
  ],
  interplay: text`Customization changes generated presentation without changing the source graph selected by ${link(id.bundleCuration, "Bundle Curation")}.`,
});

export const excalidraw = define({
  id: id.excalidraw, name: "Excalidraw", kind: "artifact", searchFacet: true, appAreaIds: area,
  definition: text`An Excalidraw drawing treated as renderable bundle content.`,
  mechanics: [text`Generation creates list thumbnails, embedded thumbnails, and a full-size standalone page.`],
  interplay: text`It participates in ${link(id.htmlGeneration, "HTML Generation")} alongside ordinary pages and ${link(id.images, "Images")}.`,
});

export const generatedBundleSearch = define({
  id: id.generatedBundleSearch, name: "Generated Bundle Search", kind: "capability", searchFacet: true, appAreaIds: area,
  definition: text`Search over page titles and content inside generated bundle output.`,
  mechanics: [text`The generated index ranks results and supports navigation and presentation customization.`],
  interplay: text`It is produced by ${link(id.htmlGeneration, "HTML Generation")}; it is distinct from ${link(id.sourceGraphSearch, "Source Graph Search")} used while curating.`,
});

export const hooks = define({
  id: id.hooks, name: "Generation Hooks", aliases: ["Hooks"], kind: "interface", searchFacet: true, appAreaIds: area,
  definition: text`Configured transformations that customize source processing and generated page output.`,
  mechanics: [text`Global and bundle-level hooks can transform titles, Markdown, and other generation inputs.`],
  interplay: text`Hooks extend ${link(id.htmlGeneration, "HTML Generation")} while remaining governed by the bundle configuration.`,
});

export const htmlGeneration = define({
  id: id.htmlGeneration, name: "HTML Generation", kind: "process", searchFacet: true, appAreaIds: [id.bundleGeneration, id.bundleReview],
  definition: text`The process that turns a curated source graph into browsable HTML bundle output.`,
  mechanics: [
    text`It renders pages and assets, applies ${link(id.hooks, "Generation Hooks")}, and prepares output for preview or export.`,
    text`A bundle that adopts multi-source output places source pages and assets beneath sources/<canonical-name>/<relative-path>. One mapping governs rendered routes, backlinks, transclusions, navigation, exports, and generated formats; generated collection pages and internal assets retain their own namespaces. Existing single-source paths remain unchanged until adoption, and returning to one source keeps the adopted layout. Source-qualified links are rewritten to portable destinations in each format.`,
    text`The selected preview page becomes readable as soon as it renders, including after customization, while remaining pages continue rendering. Live preview reads do not install or save a partial version; the complete generated output is installed atomically.`,
  ],
  interplay: text`It consumes ${link(id.bundleCuration, "Bundle Curation")} results and exposes them to ${link(id.bundleReview, "Bundle Review")} and ${link(id.bundleSharing, "Bundle Sharing")}.`,
});

export const htmlNode = define({
  id: id.htmlNode, name: "HTML Node", kind: "entity", searchFacet: true, appAreaIds: [id.bundleCuration, id.bundleGeneration],
  definition: text`A native HTML file represented as a first-class node in the source graph.`,
  mechanics: [text`Traversal follows links between HTML and Markdown and carries referenced CSS, JavaScript, and image assets.`],
  interplay: text`It is selected through ${link(id.bundleCuration, "Bundle Curation")} and preserved by ${link(id.htmlGeneration, "HTML Generation")}.`,
});

export const images = define({
  id: id.images, name: "Images", kind: "artifact", searchFacet: true, appAreaIds: area,
  definition: text`Image assets included by generated bundle pages.`,
  mechanics: [text`Oversized images can be compressed automatically to satisfy output constraints.`],
  interplay: text`${link(id.htmlGeneration, "HTML Generation")} copies or transforms them while retaining page references.`,
});

export const openKnowledgeFormat = define({
  id: id.openKnowledgeFormat, name: "Open Knowledge Format", aliases: ["OKF"], kind: "artifact", searchFacet: true, appAreaIds: [id.bundleGeneration, id.bundleSharing],
  definition: text`A portable representation of generated knowledge and its bundle index.`,
  mechanics: [text`Generation produces the representation and a ZIP export while guarding reserved output names.`],
  interplay: text`It is a generated artifact that ${link(id.bundleSharing, "Bundle Sharing")} can deliver independently of hosted HTML.`,
});

export const sourcesExport = define({
  id: id.sourcesExport, name: "Sources Export", kind: "artifact", searchFacet: true, appAreaIds: [id.bundleGeneration, id.bundleSharing],
  definition: text`A ZIP containing the filtered and sanitized source material selected for a bundle.`,
  mechanics: [text`It is generated alongside HTML output from the same curated graph.`],
  interplay: text`It projects ${link(id.bundleCuration, "Bundle Curation")} decisions into a portable artifact delivered through ${link(id.bundleSharing, "Bundle Sharing")}.`,
});

export const svg = define({
  id: id.svg, name: "SVG", kind: "artifact", searchFacet: true, appAreaIds: area,
  definition: text`An SVG treated as linked graph content and as an embeddable generated asset.`,
  mechanics: [text`A Meadow container can render it interactively at full size while ordinary embeds remain images.`],
  interplay: text`It is carried through ${link(id.htmlGeneration, "HTML Generation")} according to its source-page context.`,
});

export const versioning = define({
  id: id.versioning, name: "Generated Bundle Version", aliases: ["Versioning"], kind: "entity", searchFacet: true, appAreaIds: [id.bundleGeneration, id.bundleReview],
  definition: text`A named version of generated bundle output, with saved and unsaved generations while current and a retained saved state once frozen.`,
  mechanics: [
    text`Versions move from initial unsaved output to saved current versions with comparisons, recovery, and cancellation. Creating a successor makes it current and leaves its predecessor as a ${link(id.frozenVersion, "Frozen Version")}.`,
    text`Adding a second source or renaming a canonical source can change output paths. Source review recommends a new generated version, a connected publication revision, and retention of the prior publication. This guidance is optional and does not generate or publish a version automatically.`,
    text`Saving completes the local site workflow and returns a local preview link. Publishing is a separate, optional operation that requires an explicit user request.`,
    text`A version's generated files and its local generation record are one pair. Generation installs them together; Save, freezing a predecessor, restoration, cancellation, and recovery keep them together under one exclusive versioning operation. Freezing restores the predecessor's saved files and saved record, including a legitimately absent record.`,
    text`Review compares a saved current version with its saved generation, a never-saved new version with its predecessor's saved generation, and the first version with an empty site. Paths are relative to each version root, so a new version namespace alone is not a change. Save state is independent of that comparison: a new version can show no site differences and still be unsaved.`,
  ],
  interplay: text`${link(id.bundleGeneration, "Bundle Generation")} creates versions and ${link(id.bundleReview, "Bundle Review")} explains their currentness and differences. ${link(id.generationRecord, "Generation Records")} explain how one version's files correspond to another's. Reader connections and remote addresses belong to ${link(id.publicationRevision, "Publication Revisions")}, not generated versions.`,
});

export const frozenVersion = define({
  id: id.frozenVersion, name: "Frozen Version", aliases: ["Frozen Generated Bundle Version"],
  kind: "state", searchFacet: false, parentId: id.versioning,
  appAreaIds: [id.bundleGeneration, id.bundleReview],
  implementationRoles: ["freeze-predecessor", "inspect-integrity"] as const,
  definition: text`A previously current generated bundle version retained at its last saved generation after a successor becomes current.`,
  mechanics: [
    text`Creating the successor restores the predecessor's last saved files and matching ${link(id.generationRecord, "Generation Record")}, including the saved absence of a record for legacy output. The predecessor then remains frozen while the successor is current.`,
    text`The retained website files are inside the ${link(id.meadowHome, "Meadow Home")}, under bundles/<bundle>/html/generated_bundle_versions/<version-id>/. An HTML page in that directory is a file within the frozen version. Generation records are local metadata kept outside the website output.`,
    text`Frozen is a lifecycle promise, rather than a filesystem permission setting. ${link(id.externalFileEdits, "Editing Files Outside Meadow")} can still alter those files. Meadow checks retained output against its saved Git state and reports an Integrity Problem for modified, added, or missing files.`,
    text`The frozen version keeps its identity and saved history. Canceling a never-saved successor makes the predecessor current again; explicitly deleting frozen local files is a separate recorded lifecycle operation.`,
  ],
  interplay: text`A ${link(id.versioning, "Generated Bundle Version")} becomes frozen when a successor is created. Its ${link(id.dataIntegrity, "Data Integrity")} can be recovered through ${link(id.restoringFrozenVersion, "Restoring a Frozen Version")}. Reader links and remote copies belong to ${link(id.publicationRevision, "Publication Revisions")}.`,
});

export const restoringFrozenVersion = define({
  id: id.restoringFrozenVersion, name: "Restoring a Frozen Version", aliases: ["Restore Frozen Version from Git"],
  kind: "process", searchFacet: false, parentId: id.versioning, appAreaIds: [id.bundleReview],
  implementationRoles: ["restore"] as const,
  definition: text`Recovering a retained frozen version's local output and matching generation records from their saved Git state after an integrity problem.`,
  mechanics: [
    text`In Versions, Restore Frozen Version from Git replaces local changes with the saved output and saved ${link(id.generationRecord, "Generation Record")}. This removes the unsaved external edits to that version and restores the saved output/record pair.`,
    text`The operation requires a retained ${link(id.frozenVersion, "Frozen Version")} whose local files have not been explicitly deleted. It runs under the exclusive versioning operation lock, preserving the version's identity and the current successor.`,
    text`Restoration clears the repaired integrity problem so guarded versioning operations can proceed. It does not itself cancel the successor or make the predecessor current; canceling the never-saved successor is the later operation that returns to the predecessor.`,
  ],
  interplay: text`This is the local ${link(id.dataIntegrity, "Data Integrity")} recovery for a ${link(id.frozenVersion, "Frozen Version")} changed through ${link(id.externalFileEdits, "Editing Files Outside Meadow")}.`,
});

export const generationRecord = define({
  id: id.generationRecord, name: "Generation Record", aliases: ["Generated Output Identity"], kind: "artifact", searchFacet: false,
  appAreaIds: [id.bundleGeneration, id.bundleReview],
  implementationRoles: ["record", "classify", "pair", "declare-input", "declare-output"] as const,
  definition: text`Local metadata pairing one generated result with the accepted inputs it captured and the logical identity of each file it emitted.`,
  mechanics: [
    text`Every generation entry point captures the accepted source snapshot and generation-affecting configuration, records the actual final writer of each source-backed output, and binds the record to a fingerprint of the generated files' relative paths and bytes. A content-addressed generation ID distinguishes identical output generated from different inputs.`,
    text`A source-backed output's logical identity is its ${link(id.bundleNodeId, "Bundle Node ID")} plus a stable role: page, drawing data, asset, or structural preview. Roles never derive from filenames, directories, version prefixes, or contents. Files without a recorded owner are compared by path and bytes; no rename or similarity inference is applied.`,
    text`The record also lists the original captured source files admitted to the generated artifact, by source identity and snapshot-relative path. It stays outside the generated website, never appears in publication payloads or site-change listings, and the public reader route index remains a minimal projection of emitted page ownership.`,
    text`A result generated before records existed is Legacy and uses ordinary path comparison. A record from a newer application is Unsupported. A lost, damaged, or mismatched record is Corrupt: Review shows ordinary file differences with a notice, and the current generation must be regenerated before Save.`,
  ],
  interplay: text`${link(id.versioning, "Generated Bundle Versions")} install, save, and restore records with their files. The ${link(id.changesTab, "Changes Tab")} pairs outputs by recorded identity to show moves.`,
});

export const generationConcepts = [
  customize, excalidraw, generatedBundleSearch, hooks, htmlGeneration, htmlNode,
  images, openKnowledgeFormat, sourcesExport, svg, versioning, frozenVersion, restoringFrozenVersion, generationRecord,
] as const;
