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
export type { AppAreaDoc } from "./types.js";

export const sites: AppAreaDoc = {
  id: "sites",
  name: "Sites",
  description:
    "Tests focused on the sites list, moving between sites, and site-level " +
    "list actions such as find-in-sites, archiving, and navigation.",
};

export const siteCuration: AppAreaDoc = {
  id: "site/curation",
  name: "Curation",
  parentId: "site",
  description:
    "Tests focused on deciding which source pages are in scope for a site: " +
    "filters, graph boundaries, callouts, tracking, labels, and page-level configuration.",
};

export const siteGeneration: AppAreaDoc = {
  id: "site/generation",
  name: "Generation",
  parentId: "site",
  description:
    "Tests focused on producing site output: HTML generation, hooks, customizations, " +
    "assets, sources export, and generated-page rendering.",
};

export const siteReview: AppAreaDoc = {
  id: "site/review",
  name: "Review",
  parentId: "site",
  description:
    "Tests focused on previewing generated output and reviewing pending file changes " +
    "before they are saved or shared.",
};

export const siteSharing: AppAreaDoc = {
  id: "site/sharing",
  name: "Sharing",
  parentId: "site",
  description:
    "Tests focused on sharing or removing generated sites: publishing flows, provider " +
    "state, storage uploads, account gates, and local export boundaries.",
};

export const allAppAreaDocs: AppAreaDoc[] = [
  sites,
  siteCuration,
  siteGeneration,
  siteReview,
  siteSharing,
];

const scenarioDocToAppAreaIds: Record<string, string[]> = {
  account: ["site/sharing"],
  archived: ["sites", "site/curation"],
  blacklist: ["site/curation"],
  callout: ["site/curation"],
  "changes-tab": ["site/review"],
  customize: ["site/generation"],
  deletion: ["site/sharing"],
  excalidraw: ["site/generation"],
  filters: ["site/curation"],
  "find-in-sites": ["sites"],
  "free-sites": ["site/sharing"],
  "free-trial": ["site/sharing"],
  frontier: ["site/curation"],
  git: ["site/sharing"],
  hooks: ["site/generation"],
  "html-generation": ["site/generation", "site/review"],
  images: ["site/generation"],
  "initial-page": ["site/curation"],
  labels: ["site/curation"],
  lambda: ["site/sharing"],
  links: ["site/curation"],
  "link-gap": ["site/curation"],
  "sources-export": ["site/generation", "site/sharing"],
  migration: ["site/generation"],
  "multi-site": ["sites"],
  orphan: ["site/curation"],
  overrides: ["site/curation"],
  publishing: ["site/sharing"],
  s3: ["site/sharing"],
  search: ["site/curation"],
  sensitive: ["site/curation"],
  "site-config": ["site/curation"],
  "size-limits": ["site/generation", "site/sharing"],
  stripe: ["site/sharing"],
  tracking: ["site/curation", "site/review"],
};

export function deriveAppAreaDocIds(
  scenarioDocIds: string[],
  explicitAppAreaDocIds: string[] = []
): string[] {
  const ids = new Set<string>(explicitAppAreaDocIds);
  for (const scenarioDocId of scenarioDocIds) {
    for (const appAreaDocId of scenarioDocToAppAreaIds[scenarioDocId] ?? []) {
      ids.add(appAreaDocId);
    }
  }
  return allAppAreaDocs
    .map((doc) => doc.id)
    .filter((id) => ids.has(id));
}
