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

import { LogLevel } from './logging.js';

export interface CalloutDismissals {
  calloutInitialPageOutlinksDepth?: boolean; // Dismissed the callout about setting depth on initial page
  calloutPreviewSinglePage?: boolean; // Dismissed the warning about previewing with only the initial page tracked
  allowAddMeadowSensitivePropertyToSourcePages?: boolean; // Consented to adding meadow-sensitive property to source pages
  customizeSidebarAutoShown?: boolean; // The customize sidebar has been auto-shown on first site preview modal open
}

export interface AppConfig {
  version?: string;
  manageGitAutomatically?: boolean; // Whether Meadow should automatically run git operations (init/commit) for you (default: true)
  allowImagesToExtendToFrontier?: boolean; // Whether images linked from frontier-edge pages should be included (default: true)
  // Site-generation defaults: options that control what gets produced when
  // Meadow turns raw notes into site artifacts (HTML and side-artifacts).
  // Applies to both preview and publish since they share the same pipeline.
  generationBreadcrumbsEnabled?: boolean; // Default for whether to render breadcrumbs (default: true)
  generationBacklinksEnabled?: boolean; // Default for whether to render backlinks (default: true)
  generationTagsEnabled?: boolean; // Default for whether to generate tag pages + convert #tags to links (default: true; requires backlinks)
  generationHoverPreviewEnabled?: boolean; // Default for whether to render hover previews on links (default: false)
  generationMarkdownZipEnabled?: boolean; // Default for whether to generate a downloadable markdown+images ZIP (default: false)
  generationSpacedRepetitionEnabled?: boolean; // Default for whether to render client-side spaced repetition widgets (default: false)
  generationSpacedRepetitionTags?: string[]; // Default tags that identify source pages whose SRS prompts should be processed during generation
  deletedDefaultFilterIds?: string[]; // Tracks default filter IDs the user has intentionally deleted, so they aren't re-created
  calloutDismissals?: CalloutDismissals; // Tracks which callout dismissal states have been set
  logRotationIntervalSecs?: number; // How often to rotate log files in seconds (default: 86400 = 1 day)
  logRetentionSecs?: number; // How long to keep rotated log files in seconds (default: 1209600 = 14 days)
  logLevelOverride?: LogLevel; // Override the default log level ('info'). Common: 'debug' for verbose logging.
  globalStylePresetId?: string; // Global style preset ID (default: 'classic')
  appAutoUpdateCheckEnabled?: boolean; // Whether to auto-check for updates (default: true)
  appAutoUpdateCheckIntervalSecs?: number; // Interval between auto-update checks in seconds (default: 86400 = 1 day)
  appAutoUpdateCheckLastChecked?: string; // ISO timestamp of last update check
  meadowDeviceGuid?: string; // Unique device identifier, auto-generated on first run
  disableBaseStyleCss?: boolean; // Whether to disable the base style.css from the preset (default: false)
  disableBaseJavascriptJs?: boolean; // Whether to disable the base javascript.js from the preset (default: false)
}

