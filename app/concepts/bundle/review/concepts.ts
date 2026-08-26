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
  appAreaIds: [id.bundleReview],
  definition: text`The review surface for files that a generated bundle will create, modify, or delete.`,
  mechanics: [text`It filters change types and HTML sections, displays diffs, and groups internal asset folders.`],
  interplay: text`It makes the pending effects of ${link(id.bundleGeneration, "Bundle Generation")} explicit before ${link(id.bundleSharing, "Bundle Sharing")} acts on them.`,
});

export const reviewConcepts = [changesTab] as const;
