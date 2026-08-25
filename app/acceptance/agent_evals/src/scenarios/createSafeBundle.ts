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

import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import os from "os";
import path from "path";
import { extractContentWithoutPagespecs } from "../../../../../shared_code/utils/pagespecBlockUtils.js";
import type { AgentEvalScenario } from "../types.js";

const EXAMPLE_SOURCE = path.resolve(
  import.meta.dirname,
  "../../../../../shared_data/source_graphs/example-bundle-data",
);

export const EXPECTED_GENERATED_PAGES = [
  "Alfred Korzybski.html",
  "Anchoring Bias.html",
  "Availability Bias.html",
  "Base Rates.html",
  "Benjamin Graham.html",
  "Charlie Munger.html",
  "Circle of Competence.html",
  "Cognitive Biases.html",
  "Confirmation Bias.html",
  "Elon Musk.html",
  "Expected Value.html",
  "Feedback Loops.html",
  "First Principles Thinking.html",
  "Hanlon's Razor.html",
  "Howard Marks.html",
  "Inversion.html",
  "Latticework of Mental Models.html",
  "Man with a Hammer.html",
  "Map is Not the Territory.html",
  "Margin of Safety.html",
  "Mental Models Overview.html",
  "Notable Mental Models.html",
  "Occam's Razor.html",
  "Probabilistic Thinking.html",
  "Razors.html",
  "Second Order Thinking.html",
  "Survivorship Bias.html",
  "Warren Buffett.html",
  "William of Ockham.html",
] as const;

export const EXPECTED_GENERATED_CONTENT_ASSETS = [
  "_mw_gen/tagpages/tag--flashcards--mental-models.html",
  "images/Feedback Loop Diagram.svg",
  "images/Mental Models Diagram.svg",
] as const;

export const CREATE_SAFE_BUNDLE_SCENARIO: AgentEvalScenario = {
  schemaVersion: 1,
  id: "create-safe-bundle",
  version: 2,
  title: "Create, curate, generate, and save from an empty Meadow Home",
  baseRequestTemplate:
    "Use Meadow's command line to create a bundle from `<source-directory>`, starting at `Notable Mental Models.md`. Keep Meadow's normal defaults, include everything Meadow considers safe to include, and generate and save the site. Report the bundle slug, saved version ID, and preview URL; copy every returned identifier and URL exactly without shortening it.",
  publishingRequestAddition:
    "Publish it with the default publishing settings and return the published URL.",
  entryPage: "Notable Mental Models.md",
  inferredSlug: "notable-mental-models",
  defaults: { outlinksDepth: 3, inlinksDepth: 1 },
  expected: {
    newlyTracked: [
      "2025 taxes.md",
      "Alfred Korzybski.md",
      "Anchoring Bias.md",
      "Availability Bias.md",
      "Base Rates.md",
      "Benjamin Graham.md",
      "Charlie Munger.md",
      "Circle of Competence.md",
      "Cognitive Biases.md",
      "Confirmation Bias.md",
      "Elon Musk.md",
      "Expected Value.md",
      "Feedback Loops.md",
      "First Principles Thinking.md",
      "Hanlon's Razor.md",
      "Howard Marks.md",
      "Inversion.md",
      "Latticework of Mental Models.md",
      "Man with a Hammer.md",
      "Map is Not the Territory.md",
      "Margin of Safety.md",
      "Mental Models Overview.md",
      "Occam's Razor.md",
      "Probabilistic Thinking.md",
      "Razors.md",
      "Second Order Thinking.md",
      "Survivorship Bias.md",
      "Warren Buffett.md",
      "William of Ockham.md",
      "images/Feedback Loop Diagram.svg",
      "images/Mental Models Diagram.svg",
    ],
    alreadyTracked: ["Notable Mental Models.md"],
    sensitiveSkipped: [
      "2026-02-02.md",
      "2026-02-10.md",
      "Thoughts on Munger's Investment Portfolio.md",
    ],
    trackedButNotGenerated: ["2025 taxes.md"],
    generatedPages: [...EXPECTED_GENERATED_PAGES],
    generatedContentAssets: [...EXPECTED_GENERATED_CONTENT_ASSETS],
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

export function resolveCreateSafeBundleRequest(sourceDirectory: string, publishing: boolean): string {
  const base = CREATE_SAFE_BUNDLE_SCENARIO.baseRequestTemplate.replace(
    "<source-directory>",
    sourceDirectory,
  );
  return publishing ? `${base}\n\n${CREATE_SAFE_BUNDLE_SCENARIO.publishingRequestAddition}` : base;
}

export function createSafeBundleAnswerSheet(sourceDirectory: string, publishing: boolean): string {
  return [
    `The supplied source directory is ${sourceDirectory}.`,
    `The entry page is ${CREATE_SAFE_BUNDLE_SCENARIO.entryPage}.`,
    "Keep the normal defaults.",
    "Include everything Meadow considers safe.",
    publishing ? "Remote publication is requested." : "Remote publication is not requested.",
  ].join("\n");
}

export function materializeCreateSafeBundleSource(options: { readOnly?: boolean } = {}): {
  directory: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(path.join(os.tmpdir(), "meadow-agent-eval-source-"));
  const directory = path.join(root, "source-graph");
  cpSync(EXAMPLE_SOURCE, directory, { recursive: true });
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.name.endsWith(".pagespec.yaml")) {
        unlinkSync(entryPath);
      } else if (entry.name.endsWith(".md") && statSync(entryPath).isFile()) {
        const content = readFileSync(entryPath, "utf8");
        writeFileSync(entryPath, extractContentWithoutPagespecs(content), "utf8");
      }
    }
  };
  visit(directory);
  if (options.readOnly) {
    const makeReadOnly = (current: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) makeReadOnly(entryPath);
        else chmodSync(entryPath, 0o444);
      }
      chmodSync(current, 0o555);
    };
    makeReadOnly(directory);
  }
  return {
    directory: realpathSync(directory),
    cleanup: () => {
      const makeWritable = (current: string): void => {
        chmodSync(current, 0o755);
        for (const entry of readdirSync(current, { withFileTypes: true })) {
          const entryPath = path.join(current, entry.name);
          if (entry.isDirectory()) makeWritable(entryPath);
          else chmodSync(entryPath, 0o644);
        }
      };
      makeWritable(directory);
      rmSync(root, { recursive: true, force: true });
    },
  };
}
