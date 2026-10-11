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

export const changesTab = define({
  id: id.changesTab,
  name: "Changes Tab",
  kind: "interface",
  searchFacet: true,
  appAreaIds: [id.bundleReview],
  definition: text`The review surface for how a generated bundle's files differ from its comparison baseline: added, deleted, modified, and moved.`,
  mechanics: [
    text`It filters change types and HTML sections, displays diffs, and groups internal asset folders.`,
    text`Outputs are paired by ${link(id.generationRecord, "recorded identity")} before paths are compared. A moved file appears once, under its destination, and selecting it shows its old and new paths with the content comparison of the old and new bytes. Moved and modified are independent facts: a file that is both matches either filter and counts once in the total. HTML section filters constrain content changes only, so a pure move is never hidden by them.`,
    text`Each logical change has its own entry ID, so a deletion and an addition at the same path remain separately selectable. The tab explains its baseline and any Legacy, Unsupported, or Corrupt identity metadata.`,
  ],
  interplay: text`It makes the pending effects of ${link(id.bundleGeneration, "Bundle Generation")} explicit before ${link(id.bundleSharing, "Bundle Sharing")} acts on them.`,
});

export const reviewConcepts = [changesTab] as const;
