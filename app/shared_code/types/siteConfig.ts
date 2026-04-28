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

export interface GeneratedSiteVersion {
  versionId: string;
  firstPublishedAt: string;
  lastUpdatedAt: string;
  notes: string;
  isActive: boolean;
}

export interface SiteConfig {
  /**
   * Internal-only stable identifier for this site.
   * - Exactly 7 characters, lowercase letters + numbers
   * - Not shown to the user in create/edit UI
   * - Used for log correlation and filtering
   */
  siteGuid?: string;
  sourceDirectory?: string;
  initialSitePageTitle?: string;
  initialSitePageDirectory?: string; // "" for root, "subdir" or "subdir/nested" for nested
  defaultTraversalSitePageTitle?: string;
  defaultTraversalSitePageDirectory?: string; // "" for root, "subdir" or "subdir/nested" for nested
  generatedSiteVersions?: string[];
  archivedAt?: string | null;
  siteCreatedAt?: string;
  siteUpdatedAt?: string;
  siteLastPublishedAt?: string | null;
  siteNotes?: string;
  disabledGlobalFilters?: string[]; // Array of global filter IDs that are disabled for this site
  disabledGlobalHooks?: string[]; // Array of global hook types that are disabled for this site
  hookAppendMode?: Record<string, boolean>; // { pageTitleNormalization: true } = append mode (run global then site), absent/false = override
  // Site-generation overrides: options controlling what Meadow produces
  // when it turns this site's raw notes into site artifacts. Overrides the
  // matching app-level default; undefined = inherit.
  generationBreadcrumbsEnabled?: boolean; // Whether to render breadcrumbs (default: true)
  generationBacklinksEnabled?: boolean; // Whether to render backlinks (default: true)
  generationTagsEnabled?: boolean; // Whether to generate tag pages + convert #tags to links (default: true; requires backlinks)
  generationHoverPreviewEnabled?: boolean; // Whether to render hover previews on links (overrides app setting)
  allowImagesToExtendToFrontier?: boolean; // Whether images linked from frontier-edge pages should be included (overrides app setting)
  generationMarkdownZipEnabled?: boolean; // Whether to generate a downloadable markdown+images ZIP (default: false)
  generationSpacedRepetitionEnabled?: boolean; // Whether to render client-side spaced repetition widgets (default: false)
  generationSpacedRepetitionTags?: string[]; // Tags that identify source pages whose SRS prompts should be processed during generation
  stylePresetId?: string; // Style preset ID for this site (undefined = inherit from global)
  disableBaseStyleCss?: boolean; // Whether to disable the base style.css from the preset (overrides app setting)
  disableBaseJavascriptJs?: boolean; // Whether to disable the base javascript.js from the preset (overrides app setting)
}
