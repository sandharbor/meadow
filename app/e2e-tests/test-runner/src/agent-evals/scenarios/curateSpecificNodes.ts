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
  version: 1,
  title: "Curate specific nodes without generating or publishing",
  baseRequestTemplate: [
    "Use Meadow's command line to create a bundle from `<source-directory>`, starting at `Notable Mental Models.md`, and keep Meadow's normal defaults.",
    "Do not use bulk tracking. Track only `Charlie Munger.md` and `Warren Buffett.md` in addition to the entry page. Then blacklist Charlie Munger and set Warren Buffett's outlink depth override to 1 and inlink depth override to 0.",
    "Do not generate, save, or publish the bundle. Report the bundle slug, both node IDs, and their final curation states.",
  ].join(" "),
  publishingRequestAddition: "",
  entryPage: "Notable Mental Models.md",
  inferredSlug: "notable-mental-models",
  defaults: { outlinksDepth: 3, inlinksDepth: 1 },
  expected: {
    newlyTracked: ["Charlie Munger.md", "Warren Buffett.md"],
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
    "Only Charlie Munger and Warren Buffett should be newly tracked.",
    "Charlie Munger should finish blacklisted.",
    "Warren Buffett should finish with outlink depth 1 and inlink depth 0.",
    "Generation, saving, and publication are not requested.",
  ].join("\n");
}
