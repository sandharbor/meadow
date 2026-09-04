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

const area = [id.bundleSharing] as const;

export const publishing = define({
  id: id.publishing, name: "Publishing", kind: "process", appAreaIds: area,
  definition: text`The flow that makes reviewed generated bundle output available through a publishing destination.`,
  mechanics: [text`It previews output, reviews files, transfers artifacts, and records the resulting publication state.`],
  interplay: text`It consumes ${link(id.bundleGeneration, "Bundle Generation")} output after ${link(id.bundleReview, "Bundle Review")} and can use ${link(id.s3, "S3-Compatible Object Storage")}.`,
});

export const publicationRevision = define({
  id: id.publicationRevision, name: "Publication Revision", kind: "entity", appAreaIds: area,
  definition: text`A provider-specific record that publishes one saved generated bundle version at one provider address.`,
  mechanics: [text`Changing either the generated version or the publish slug creates a revision. It records its predecessor, reader connection, retention choice, remote state, and immutable provider identity.`],
  interplay: text`${link(id.publishing, "Publishing")} creates and manages revisions independently for each provider, while ${link(id.versioning, "Generated Bundle Version")} remains provider-neutral.`,
});

export const s3 = define({
  id: id.s3, name: "S3-Compatible Object Storage", aliases: ["S3", "Object Storage"], kind: "interface", appAreaIds: area,
  definition: text`The object-storage interface used to upload, list, and delete published bundle artifacts.`,
  mechanics: [text`The same contract can be exercised by a local-compatible service or a remote provider.`],
  interplay: text`${link(id.publishing, "Publishing")} writes artifacts through this interface and ${link(id.deletion, "Published Bundle Deletion")} removes them.`,
});

export const deletion = define({
  id: id.deletion, name: "Published Bundle Deletion", aliases: ["Deletion"], kind: "process", appAreaIds: area,
  definition: text`The confirmed removal of a bundle and any artifacts or publication state owned by it.`,
  mechanics: [text`Deletion coordinates local state removal with cleanup at each active sharing destination.`],
  interplay: text`It reverses the durable effects of ${link(id.publishing, "Publishing")} without redefining generation or review.`,
});

export const git = define({
  id: id.git, name: "Meadow Home Git History", aliases: ["Git"], kind: "mechanism", appAreaIds: area,
  definition: text`The repository history that durably records generated files and Meadow Home changes.`,
  mechanics: [text`Completed changes are committed promptly so the durable store is not left with untracked or uncommitted output.`],
  interplay: text`It records local effects of ${link(id.bundleGeneration, "Bundle Generation")} and ${link(id.bundleSharing, "Bundle Sharing")}.`,
});

export const sharingConcepts = [publishing, publicationRevision, s3, deletion, git] as const;
