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

export const SENSITIVE_FILE = "Thoughts on Munger's Investment Portfolio.md";
export const TRANSITION_FILE = "Warren Buffett.md";

export const CURATE_SENSITIVE_FILE_SCENARIO: AgentEvalScenario = {
  schemaVersion: 1,
  id: "curate-sensitive-file",
  version: 3,
  title: "Explicitly include sensitive content and resolve a boundary-review pause",
  baseRequestTemplate: [
    "Use Meadow's command line to create a bundle from `<source-directory>`, starting at `Notable Mental Models.md`, and keep Meadow's normal defaults.",
    `Try to track \`${SENSITIVE_FILE}\` normally, then explicitly include it after Meadow refuses. Run each inclusion sequentially: wait for that first explicit inclusion to finish, then retry the identical command and wait for changed:false to prove it is idempotent. Do not run those commands in parallel.`,
    "Only after the idempotent retry finishes will a source editor change that file; then refresh its tracking evidence with another explicit inclusion.",
    `First track \`${TRANSITION_FILE}\` successfully while it is still non-sensitive. Only after it is tracked, mark that node sensitive; do not mark it sensitive before tracking. Then attempt generation and use Meadow's command workflow to resolve any required boundary-review pause without opening a browser.`,
    "Generate successfully after reaffirmation. Do not save or publish. Report the bundle slug, both node IDs, the Review Request ID, and the final version ID.",
  ].join(" "),
  publishingRequestAddition: "",
  entryPage: "Notable Mental Models.md",
  inferredSlug: "notable-mental-models",
  defaults: { outlinksDepth: 3, inlinksDepth: 1 },
  expected: {
    newlyTracked: [SENSITIVE_FILE, TRANSITION_FILE],
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

export function resolveCurateSensitiveFileRequest(sourceDirectory: string): string {
  return CURATE_SENSITIVE_FILE_SCENARIO.baseRequestTemplate.replace(
    "<source-directory>",
    sourceDirectory,
  );
}

export function curateSensitiveFileAnswerSheet(sourceDirectory: string): string {
  return [
    `The supplied source directory is ${sourceDirectory}.`,
    `The entry page is ${CURATE_SENSITIVE_FILE_SCENARIO.entryPage}.`,
    `The initially sensitive file is ${SENSITIVE_FILE}.`,
    `The non-sensitive file that will become sensitive is ${TRANSITION_FILE}.`,
    "Keep the normal defaults.",
    "The explicit sensitive inclusion and deterministic CLI reaffirmation are requested.",
    "Browser opening, saving, and publication are not requested.",
  ].join("\n");
}
