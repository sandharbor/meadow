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

import { coreConceptIds } from "../ids.js";
import { conceptLink, conceptText, defineMeadowConcept } from "../language.js";

export const bundle = defineMeadowConcept({
  id: coreConceptIds.bundle,
  name: "Bundle",
  kind: "app-area",
  definition: conceptText`The application area concerned with selecting knowledge, generating durable outputs, reviewing changes, and sharing those outputs.`,
  mechanics: [
    conceptText`Its child areas separate collection management, curation, generation, review, and sharing responsibilities.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.bundles, "Bundles")} manages the collection surface; ${conceptLink(coreConceptIds.bundleCuration, "Curation")}, ${conceptLink(coreConceptIds.bundleGeneration, "Generation")}, ${conceptLink(coreConceptIds.bundleReview, "Review")}, and ${conceptLink(coreConceptIds.bundleSharing, "Sharing")} carry a bundle through its lifecycle.`,
});

export const bundles = defineMeadowConcept({
  id: coreConceptIds.bundles,
  name: "Bundles",
  kind: "app-area",
  parentId: coreConceptIds.bundle,
  definition: conceptText`The application area for the bundle collection and bundle-level navigation or actions.`,
  mechanics: [
    conceptText`It lists current and archived bundles, selects a bundle, and supports operations that span several bundles.`,
  ],
  interplay: conceptText`It chooses the bundle whose pages are managed in ${conceptLink(coreConceptIds.bundleCuration, "Curation")} and whose outputs move through ${conceptLink(coreConceptIds.bundleGeneration, "Generation")}, ${conceptLink(coreConceptIds.bundleReview, "Review")}, and ${conceptLink(coreConceptIds.bundleSharing, "Sharing")}.`,
});

export const bundleCuration = defineMeadowConcept({
  id: coreConceptIds.bundleCuration,
  name: "Bundle Curation",
  aliases: ["Curation"],
  kind: "app-area",
  parentId: coreConceptIds.bundle,
  definition: conceptText`The application area for deciding which source pages belong in a bundle and how its graph is bounded.`,
  mechanics: [
    conceptText`It applies filters, graph boundaries, page tracking, sensitivity, and page-level configuration.`,
  ],
  interplay: conceptText`Its selected and configured graph is the input to ${conceptLink(coreConceptIds.bundleGeneration, "Bundle Generation")}; pending consequences are inspected in ${conceptLink(coreConceptIds.bundleReview, "Bundle Review")}.`,
});

export const bundleGeneration = defineMeadowConcept({
  id: coreConceptIds.bundleGeneration,
  name: "Bundle Generation",
  aliases: ["Generation"],
  kind: "app-area",
  parentId: coreConceptIds.bundle,
  definition: conceptText`The application area for turning a curated bundle graph into generated outputs.`,
  mechanics: [
    conceptText`It produces HTML, exports, assets, and versioned output from the configured bundle.`,
  ],
  interplay: conceptText`It consumes the graph prepared by ${conceptLink(coreConceptIds.bundleCuration, "Bundle Curation")}, exposes changes through ${conceptLink(coreConceptIds.bundleReview, "Bundle Review")}, and supplies artifacts to ${conceptLink(coreConceptIds.bundleSharing, "Bundle Sharing")}.`,
});

export const bundleReview = defineMeadowConcept({
  id: coreConceptIds.bundleReview,
  name: "Bundle Review",
  aliases: ["Review"],
  kind: "app-area",
  parentId: coreConceptIds.bundle,
  definition: conceptText`The application area for previewing generated output and reviewing pending file changes.`,
  mechanics: [
    conceptText`It presents generated results, file lifecycles, comparisons, and decisions before outputs are saved or shared.`,
  ],
  interplay: conceptText`It explains the effects of ${conceptLink(coreConceptIds.bundleCuration, "Bundle Curation")} and ${conceptLink(coreConceptIds.bundleGeneration, "Bundle Generation")} before ${conceptLink(coreConceptIds.bundleSharing, "Bundle Sharing")} publishes or removes output.`,
});

export const bundleSharing = defineMeadowConcept({
  id: coreConceptIds.bundleSharing,
  name: "Bundle Sharing",
  aliases: ["Sharing"],
  kind: "app-area",
  parentId: coreConceptIds.bundle,
  definition: conceptText`The application area for delivering or removing generated bundle artifacts through a selected publishing or export interface.`,
  mechanics: [
    conceptText`It coordinates provider operations, local exports, publication state, and removal of shared artifacts.`,
  ],
  interplay: conceptText`It receives approved output from ${conceptLink(coreConceptIds.bundleReview, "Bundle Review")} and artifacts from ${conceptLink(coreConceptIds.bundleGeneration, "Bundle Generation")} without taking ownership of their creation.`,
});

export const appAreaConcepts = [
  bundle,
  bundles,
  bundleCuration,
  bundleGeneration,
  bundleReview,
  bundleSharing,
] as const;

/** App areas exposed as acceptance filters; `bundle` is their grouping root. */
export const acceptanceAppAreaConcepts = [
  bundles,
  bundleCuration,
  bundleGeneration,
  bundleReview,
  bundleSharing,
] as const;
