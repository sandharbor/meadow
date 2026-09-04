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

export const coreConceptIds = {
  bundle: "bundle",
  bundles: "bundles",
  bundleCuration: "bundle/curation",
  bundleGeneration: "bundle/generation",
  bundleReview: "bundle/review",
  bundleSharing: "bundle/sharing",

  archived: "archived",
  blacklist: "blacklist",
  bundleConfig: "bundle-config",
  bundleSlug: "bundle-slug",
  callout: "callout",
  changesTab: "changes-tab",
  cli: "cli",
  customize: "customize",
  deletion: "deletion",
  excalidraw: "excalidraw",
  filters: "filters",
  findInBundles: "find-in-bundles",
  folderBundles: "folder-bundles",
  folderFilter: "folder-filter",
  frontier: "frontier",
  git: "git",
  hooks: "hooks",
  htmlGeneration: "html-generation",
  htmlNode: "html-node",
  images: "images",
  initialPage: "initial-page",
  labels: "labels",
  linkGap: "link-gap",
  links: "links",
  migration: "migration",
  multiBundle: "multi-bundle",
  openKnowledgeFormat: "okf",
  orphan: "orphan",
  overrides: "overrides",
  paths: "paths",
  publishing: "publishing",
  publicationRevision: "publication-revision",
  s3: "s3",
  sourceGraphSearch: "source-graph-search",
  generatedBundleSearch: "generated-bundle-search",
  sensitive: "sensitive",
  softwareUpdate: "software-update",
  sourcesExport: "sources-export",
  startupRecovery: "startup-recovery",
  svg: "svg",
  tracking: "tracking",
  versioning: "versioning",

  meadowHome: "meadow-home",
  runtimeInstance: "runtime-instance",
  runtimeSupervisor: "runtime-supervisor",
  runtimeLaunchSpec: "runtime-launch-spec",
  runtimeService: "runtime-service",
  runtimePayload: "runtime-payload",
  homeOwnershipLock: "home-ownership-lock",
  runtimeSessionDescriptor: "runtime-session-descriptor",
  officialClient: "official-client",
  desktopHost: "desktop-host",
  commandClient: "command-client",
  webClient: "web-client",
  lease: "lease",
  clientLease: "client-lease",
  operationLease: "operation-lease",
  browserSession: "browser-session",
  heartbeat: "heartbeat",
  compatibilityNegotiation: "compatibility-negotiation",
  cooperativeHandoff: "cooperative-handoff",
} as const;

export type CoreConceptId = typeof coreConceptIds[keyof typeof coreConceptIds];
