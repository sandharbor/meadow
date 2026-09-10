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

import type { AgentEvalScenario } from "../types.js";

export const CURATE_SPECIFIC_NODES_SCENARIO: AgentEvalScenario = {
  schemaVersion: 1,
  id: "curate-specific-nodes",
  version: 2,
  title: "Curate specific nodes without generating or publishing",
  baseRequestTemplate: [
    "Set up a site from my notes in `<source-directory>`, starting with",
    "`Notable Mental Models.md`. Add `Warren Buffett.md`, but keep `Charlie Munger.md`",
    "out of the site. From Buffett's page, follow links just one step out, and don't pull in",
    "pages just because they link to Buffett. Leave other settings alone.",
    "Just set this up for now; don't generate, save or publish. Tell me what you changed.",
  ].join(" "),
  publishingRequestAddition: "",
  entryPage: "Notable Mental Models.md",
  inferredSlug: "notable-mental-models",
  defaults: { outlinksDepth: 3, inlinksDepth: 1 },
  expected: {
    newlyTracked: ["Warren Buffett.md"],
    alreadyTracked: ["Notable Mental Models.md"],
    sensitiveSkipped: [],
    trackedButNotGenerated: [],
    generatedPages: [],
    generatedContentAssets: [],
  },
  profiles: {
    manager: {
      adapter: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      profileVersion: 1,
    },
    operator: {
      adapter: "codex",
      model: "gpt-5.6-luna",
      reasoningEffort: "medium",
      profileVersion: 1,
    },
  },
  limits: { operatorTurns: 4, durationMs: 10 * 60_000, idleMs: 90_000 },
};

export function resolveCurateSpecificNodesRequest(sourceDirectory: string): string {
  return CURATE_SPECIFIC_NODES_SCENARIO.baseRequestTemplate.replace(
    "<source-directory>",
    sourceDirectory,
  );
}

export function curateSpecificNodesAnswerSheet(sourceDirectory: string): string {
  return [
    `The supplied source directory is ${sourceDirectory}.`,
    `The entry page is ${CURATE_SPECIFIC_NODES_SCENARIO.entryPage}.`,
    "Keep the normal defaults.",
    "Only the entry page, Buffett inclusion and Munger exclusion need to be configured.",
    "Charlie Munger must stay out of the site.",
    "Follow Buffett links one step out, with no incoming-link expansion.",
    "Generation, saving, and publication are not requested.",
  ].join("\n");
}
