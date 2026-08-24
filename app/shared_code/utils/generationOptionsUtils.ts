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

import { AppConfig } from '../../contracts/types/appConfig.js';
import { BundleConfig } from '../../contracts/types/bundleConfig.js';

export interface EffectiveGenerationOptions {
  breadcrumbsEnabled: boolean;
  backlinksEnabled: boolean;
  tagsEnabled: boolean;
  searchEnabled: boolean;
  hoverPreviewEnabled: boolean;
  folderNavigationEnabled: boolean;
  sourcesExportEnabled: boolean;
  openKnowledgeFormatEnabled: boolean;
  spacedRepetitionEnabled: boolean;
  spacedRepetitionTags: string[];
  baseStyleCssDisabled: boolean;
  baseJavascriptJsDisabled: boolean;
}

/**
 * Resolves the effective generation options using:
 * - bundle override (if present)
 * - else global app config (if present)
 * - else default (true for most options, false for hover preview)
 *
 * OKF is currently bundle-specific because its root files require per-bundle source page choices.
 * Note: tags require backlinks; if backlinks are disabled, tags are forced off.
 */
export function resolveEffectiveGenerationOptions(
  appConfig: AppConfig | undefined,
  bundleConfig: BundleConfig | undefined
): EffectiveGenerationOptions {
  const breadcrumbsEnabled = (bundleConfig?.generationBreadcrumbsEnabled ?? appConfig?.generationBreadcrumbsEnabled) !== false;
  const backlinksEnabled = (bundleConfig?.generationBacklinksEnabled ?? appConfig?.generationBacklinksEnabled) !== false;
  const rawTagsEnabled = (bundleConfig?.generationTagsEnabled ?? appConfig?.generationTagsEnabled) !== false;
  const tagsEnabled = rawTagsEnabled && backlinksEnabled;
  const searchEnabled = (bundleConfig?.generationSearchEnabled ?? appConfig?.generationSearchEnabled) !== false;
  const hoverPreviewEnabled = (bundleConfig?.generationHoverPreviewEnabled ?? appConfig?.generationHoverPreviewEnabled) === true;
  const folderNavigationEnabled = (bundleConfig?.generationFolderNavigationEnabled ?? appConfig?.generationFolderNavigationEnabled) === true;
  const sourcesExportEnabled = (bundleConfig?.generationMarkdownZipEnabled ?? appConfig?.generationMarkdownZipEnabled) === true;
  const openKnowledgeFormatEnabled = bundleConfig?.generationOpenKnowledgeFormatEnabled === true;
  const spacedRepetitionEnabled = (bundleConfig?.generationSpacedRepetitionEnabled ?? appConfig?.generationSpacedRepetitionEnabled) === true;
  const spacedRepetitionTags = bundleConfig?.generationSpacedRepetitionTags
    ?? appConfig?.generationSpacedRepetitionTags
    ?? [];

  const baseStyleCssDisabled = (bundleConfig?.disableBaseStyleCss ?? appConfig?.disableBaseStyleCss) === true;
  const baseJavascriptJsDisabled = (bundleConfig?.disableBaseJavascriptJs ?? appConfig?.disableBaseJavascriptJs) === true;

  return { breadcrumbsEnabled, backlinksEnabled, tagsEnabled, searchEnabled, hoverPreviewEnabled, folderNavigationEnabled, sourcesExportEnabled, openKnowledgeFormatEnabled, spacedRepetitionEnabled, spacedRepetitionTags, baseStyleCssDisabled, baseJavascriptJsDisabled };
}
