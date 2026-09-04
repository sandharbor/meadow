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
  id: id.customize, name: "Bundle Customization", aliases: ["Customize"], kind: "capability", appAreaIds: area,
  definition: text`Settings that change the presentation and navigation of generated bundle output.`,
  mechanics: [text`Options such as breadcrumbs and backlinks are applied while ${link(id.htmlGeneration, "HTML Generation")} renders pages.`],
  interplay: text`Customization changes generated presentation without changing the source graph selected by ${link(id.bundleCuration, "Bundle Curation")}.`,
});

export const excalidraw = define({
  id: id.excalidraw, name: "Excalidraw", kind: "artifact", appAreaIds: area,
  definition: text`An Excalidraw drawing treated as renderable bundle content.`,
  mechanics: [text`Generation creates list thumbnails, embedded thumbnails, and a full-size standalone page.`],
  interplay: text`It participates in ${link(id.htmlGeneration, "HTML Generation")} alongside ordinary pages and ${link(id.images, "Images")}.`,
});

export const generatedBundleSearch = define({
  id: id.generatedBundleSearch, name: "Generated Bundle Search", kind: "capability", appAreaIds: area,
  definition: text`Search over page titles and content inside generated bundle output.`,
  mechanics: [text`The generated index ranks results and supports navigation and presentation customization.`],
  interplay: text`It is produced by ${link(id.htmlGeneration, "HTML Generation")}; it is distinct from ${link(id.sourceGraphSearch, "Source Graph Search")} used while curating.`,
});

export const hooks = define({
  id: id.hooks, name: "Generation Hooks", aliases: ["Hooks"], kind: "interface", appAreaIds: area,
  definition: text`Configured transformations that customize source processing and generated page output.`,
  mechanics: [text`Global and bundle-level hooks can transform titles, Markdown, and other generation inputs.`],
  interplay: text`Hooks extend ${link(id.htmlGeneration, "HTML Generation")} while remaining governed by the bundle configuration.`,
});

export const htmlGeneration = define({
  id: id.htmlGeneration, name: "HTML Generation", kind: "process", appAreaIds: [id.bundleGeneration, id.bundleReview],
  definition: text`The process that turns a curated source graph into browsable HTML bundle output.`,
  mechanics: [text`It renders pages and assets, applies ${link(id.hooks, "Generation Hooks")}, and prepares output for preview or export.`],
  interplay: text`It consumes ${link(id.bundleCuration, "Bundle Curation")} results and exposes them to ${link(id.bundleReview, "Bundle Review")} and ${link(id.bundleSharing, "Bundle Sharing")}.`,
});

export const htmlNode = define({
  id: id.htmlNode, name: "HTML Node", kind: "entity", appAreaIds: [id.bundleCuration, id.bundleGeneration],
  definition: text`A native HTML file represented as a first-class node in the source graph.`,
  mechanics: [text`Traversal follows links between HTML and Markdown and carries referenced CSS, JavaScript, and image assets.`],
  interplay: text`It is selected through ${link(id.bundleCuration, "Bundle Curation")} and preserved by ${link(id.htmlGeneration, "HTML Generation")}.`,
});

export const images = define({
  id: id.images, name: "Images", kind: "artifact", appAreaIds: area,
  definition: text`Image assets included by generated bundle pages.`,
  mechanics: [text`Oversized images can be compressed automatically to satisfy output constraints.`],
  interplay: text`${link(id.htmlGeneration, "HTML Generation")} copies or transforms them while retaining page references.`,
});

export const openKnowledgeFormat = define({
  id: id.openKnowledgeFormat, name: "Open Knowledge Format", aliases: ["OKF"], kind: "artifact", appAreaIds: [id.bundleGeneration, id.bundleSharing],
  definition: text`A portable representation of generated knowledge and its bundle index.`,
  mechanics: [text`Generation produces the representation and a ZIP export while guarding reserved output names.`],
  interplay: text`It is a generated artifact that ${link(id.bundleSharing, "Bundle Sharing")} can deliver independently of hosted HTML.`,
});

export const sourcesExport = define({
  id: id.sourcesExport, name: "Sources Export", kind: "artifact", appAreaIds: [id.bundleGeneration, id.bundleSharing],
  definition: text`A ZIP containing the filtered and sanitized source material selected for a bundle.`,
  mechanics: [text`It is generated alongside HTML output from the same curated graph.`],
  interplay: text`It projects ${link(id.bundleCuration, "Bundle Curation")} decisions into a portable artifact delivered through ${link(id.bundleSharing, "Bundle Sharing")}.`,
});

export const svg = define({
  id: id.svg, name: "SVG", kind: "artifact", appAreaIds: area,
  definition: text`An SVG treated as linked graph content and as an embeddable generated asset.`,
  mechanics: [text`A Meadow container can render it interactively at full size while ordinary embeds remain images.`],
  interplay: text`It is carried through ${link(id.htmlGeneration, "HTML Generation")} according to its source-page context.`,
});

export const versioning = define({
  id: id.versioning, name: "Generated Bundle Version", aliases: ["Versioning"], kind: "entity", appAreaIds: [id.bundleGeneration, id.bundleReview],
  definition: text`An immutable, named snapshot in the lifecycle of generated bundle output.`,
  mechanics: [text`Versions move from initial unsaved output to saved current versions with comparisons, recovery, and cancellation.`],
  interplay: text`${link(id.bundleGeneration, "Bundle Generation")} creates versions and ${link(id.bundleReview, "Bundle Review")} explains their currentness and differences. Reader connections and remote addresses belong to ${link(id.publicationRevision, "Publication Revisions")}, not generated versions.`,
});

export const generationConcepts = [
  customize, excalidraw, generatedBundleSearch, hooks, htmlGeneration, htmlNode,
  images, openKnowledgeFormat, sourcesExport, svg, versioning,
] as const;
