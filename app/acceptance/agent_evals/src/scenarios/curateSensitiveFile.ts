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
import { CREATE_SAFE_BUNDLE_SCENARIO } from "./createSafeBundle.js";

export const SENSITIVE_FILE = "Thoughts on Munger's Investment Portfolio.md";
export const SOURCE_UPDATE_TEXT =
  "My updated conclusion: patience matters more than diversification.";

export const CURATE_SENSITIVE_FILE_SCENARIO: AgentEvalScenario = {
  schemaVersion: 1,
  id: "curate-sensitive-file",
  version: 4,
  title: "Make a local site with a private note, then update it",
  baseRequestTemplate: [
    "Make a local site from my notes in `<source-directory>`, starting with",
    "`Notable Mental Models.md`. Include the safe notes and also",
    "`Thoughts on Munger's Investment Portfolio.md`",
    "even though it is marked private; I want that page in this site.",
    "Keep the usual settings. Give me a preview link, but don't open a browser,",
    "save or publish yet.",
  ].join(" "),
  followUpRequests: [
    [
      "I've updated my Munger portfolio note. Please update the site to include the new text.",
      "I still want that private page included. Give me the new preview link;",
      "don't open a browser, save or publish yet.",
    ].join(" "),
  ],
  publishingRequestAddition: "",
  entryPage: "Notable Mental Models.md",
  inferredSlug: "notable-mental-models",
  defaults: { outlinksDepth: 3, inlinksDepth: 1 },
  expected: {
    ...CREATE_SAFE_BUNDLE_SCENARIO.expected,
    newlyTracked: [...CREATE_SAFE_BUNDLE_SCENARIO.expected.newlyTracked, SENSITIVE_FILE],
    sensitiveSkipped: CREATE_SAFE_BUNDLE_SCENARIO.expected.sensitiveSkipped.filter(
      file => file !== SENSITIVE_FILE,
    ),
    generatedPages: [
      ...CREATE_SAFE_BUNDLE_SCENARIO.expected.generatedPages,
      SENSITIVE_FILE.replace(/\.md$/, ".html"),
    ],
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
    "Keep the normal defaults.",
    "The user wants the private Munger portfolio page included in the local site.",
    "Browser opening, saving, and publication are not requested.",
  ].join("\n");
}
