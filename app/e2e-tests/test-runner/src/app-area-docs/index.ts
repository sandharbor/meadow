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

import { AppAreaDoc } from "./types.js";
import type { ScenarioDocAppAreaAssignment } from "./validation.js";
export type { AppAreaDoc } from "./types.js";

export const bundles: AppAreaDoc = {
  id: "bundles",
  name: "Bundles",
  description:
    "Tests focused on the bundles list, moving between bundles, and bundle-level " +
    "list actions such as find-in-bundles, archiving, and navigation.",
};

export const bundleCuration: AppAreaDoc = {
  id: "bundle/curation",
  name: "Curation",
  parentId: "bundle",
  description:
    "Tests focused on deciding which source pages are in scope for a bundle: " +
    "filters, graph boundaries, callouts, tracking, labels, and page-level configuration.",
};

export const bundleGeneration: AppAreaDoc = {
  id: "bundle/generation",
  name: "Generation",
  parentId: "bundle",
  description:
    "Tests focused on producing bundle output: HTML generation, hooks, customizations, " +
    "assets, sources export, and generated-page rendering.",
};

export const bundleReview: AppAreaDoc = {
  id: "bundle/review",
  name: "Review",
  parentId: "bundle",
  description:
    "Tests focused on previewing generated output and reviewing pending file changes " +
    "before they are saved or shared.",
};

export const bundleSharing: AppAreaDoc = {
  id: "bundle/sharing",
  name: "Sharing",
  parentId: "bundle",
  description:
    "Tests focused on sharing or removing generated bundles: publishing flows, provider " +
    "state, storage uploads, account gates, and local export boundaries.",
};

export const allAppAreaDocs: AppAreaDoc[] = [
  bundles,
  bundleCuration,
  bundleGeneration,
  bundleReview,
  bundleSharing,
];

export const scenarioDocToAppAreaIds: Readonly<Record<string, ScenarioDocAppAreaAssignment>> = {
  archived: ["bundles", "bundle/curation"],
  cli: ["bundles"],
  blacklist: ["bundle/curation"],
  callout: ["bundle/curation"],
  "changes-tab": ["bundle/review"],
  customize: ["bundle/generation"],
  deletion: ["bundle/sharing"],
  excalidraw: ["bundle/generation"],
  filters: ["bundle/curation"],
  "find-in-bundles": ["bundles"],
  "folder-bundles": ["bundles", "bundle/curation"],
  "folder-filter": ["bundle/curation"],
  frontier: ["bundle/curation"],
  git: ["bundle/sharing"],
  hooks: ["bundle/generation"],
  "html-generation": ["bundle/generation", "bundle/review"],
  "html-node": ["bundle/curation", "bundle/generation"],
  images: ["bundle/generation"],
  "initial-page": ["bundle/curation"],
  labels: ["bundle/curation"],
  links: ["bundle/curation"],
  "link-gap": ["bundle/curation"],
  paths: ["bundle/curation"],
  okf: ["bundle/generation", "bundle/sharing"],
  "sources-export": ["bundle/generation", "bundle/sharing"],
  migration: ["bundle/generation"],
  "multi-bundle": ["bundles"],
  orphan: ["bundle/curation"],
  overrides: ["bundle/curation"],
  publishing: ["bundle/sharing"],
  s3: ["bundle/sharing"],
  search: ["bundle/curation"],
  sensitive: ["bundle/curation"],
  "bundle-config": ["bundle/curation"],
  tracking: ["bundle/curation", "bundle/review"],
  versioning: ["bundle/generation", "bundle/review"],
};

export function deriveAppAreaDocIds(
  scenarioDocIds: string[],
  explicitAppAreaDocIds: string[] = [],
  moduleScenarioDocToAppAreaIds: ReadonlyMap<string, readonly string[]> = new Map()
): string[] {
  const ids = new Set<string>(explicitAppAreaDocIds);
  for (const scenarioDocId of scenarioDocIds) {
    const appAreaDocIds = [
      ...(scenarioDocToAppAreaIds[scenarioDocId] ?? []),
      ...(moduleScenarioDocToAppAreaIds.get(scenarioDocId) ?? []),
    ];
    for (const appAreaDocId of appAreaDocIds) {
      ids.add(appAreaDocId);
    }
  }
  return allAppAreaDocs
    .map((doc) => doc.id)
    .filter((id) => ids.has(id));
}
