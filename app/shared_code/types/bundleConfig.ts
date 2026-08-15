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

import type { BundleNodeId } from './bundleNodeConfig.js';

export interface GeneratedBundleVersion {
  versionId: string;
  firstPublishedAt: string;
  lastUpdatedAt: string;
  notes: string;
  isActive: boolean;
}

export interface BundleConfig {
  /**
   * Internal-only stable identifier for this bundle.
   * - Exactly 7 characters, lowercase letters + numbers
   * - Not shown to the user in create/edit UI
   * - Used for log correlation and filtering
   */
  bundleGuid?: string;
  sourceDirectory?: string;
  entryBundleNodeId?: BundleNodeId;
  defaultTraversalBundleNodeId?: BundleNodeId;
  defaultOutlinksDepth?: number;
  defaultInlinksDepth?: number;
  generatedBundleVersions?: string[];
  archivedAt?: string | null;
  bundleCreatedAt?: string;
  bundleUpdatedAt?: string;
  bundleLastPublishedAt?: string | null;
  bundleNotes?: string;
  /** True when Meadow created this bundle through the built-in example flow. */
  createdFromExample?: boolean;
  publishSlug?: string; // Stable slug to use for published/exported filenames when present
  disabledGlobalFilters?: string[]; // Array of global filter IDs that are disabled for this bundle
  disabledGlobalHooks?: string[]; // Array of global hook types that are disabled for this bundle
  hookAppendMode?: Record<string, boolean>; // { pageTitleNormalization: true } = append mode (run global then bundle), absent/false = override
  // Bundle-generation overrides: options controlling what Meadow produces
  // when it turns this bundle's raw notes into bundle artifacts. Overrides the
  // matching app-level default; undefined = inherit.
  generationBreadcrumbsEnabled?: boolean; // Whether to render breadcrumbs (default: true)
  generationBacklinksEnabled?: boolean; // Whether to render backlinks (default: true)
  generationTagsEnabled?: boolean; // Whether to generate tag pages + convert #tags to links (default: true; requires backlinks)
  generationSearchEnabled?: boolean; // Whether to generate bundle search UI + index (default: true)
  generationHoverPreviewEnabled?: boolean; // Whether to render hover previews on links (overrides app setting)
  generationFolderNavigationEnabled?: boolean; // Whether to render the generated-bundle folder navigation sidebar (default: false)
  allowImagesToExtendToFrontier?: boolean; // Whether images linked from frontier-edge pages should be included (overrides app setting)
  generationMarkdownZipEnabled?: boolean; // Whether to generate a downloadable sources ZIP (default: false)
  generationOpenKnowledgeFormatEnabled?: boolean; // Whether to generate an Open Knowledge Format bundle (default: false)
  generationOpenKnowledgeFormatIndexMode?: 'generated' | 'trackedPage'; // Bundle-specific OKF index.md source selection
  generationOpenKnowledgeFormatIndexSourcePath?: string; // Source-graph-relative path used when OKF index mode is trackedPage
  generationOpenKnowledgeFormatLogMode?: 'auto' | 'none' | 'trackedPage'; // Bundle-specific OKF log.md source selection
  generationOpenKnowledgeFormatLogSourcePath?: string; // Source-graph-relative path used when OKF log mode is trackedPage
  generationSpacedRepetitionEnabled?: boolean; // Whether to render client-side spaced repetition widgets (default: false)
  generationSpacedRepetitionTags?: string[]; // Tags that identify source pages whose SRS prompts should be processed during generation
  stylePresetId?: string; // Style preset ID for this bundle (undefined = inherit from global)
  disableBaseStyleCss?: boolean; // Whether to disable the base style.css from the preset (overrides app setting)
  disableBaseJavascriptJs?: boolean; // Whether to disable the base javascript.js from the preset (overrides app setting)
}
