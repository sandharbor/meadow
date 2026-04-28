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

import { AppConfig } from '../types/appConfig.js';
import { SiteConfig } from '../types/siteConfig.js';

export interface EffectiveGenerationOptions {
  breadcrumbsEnabled: boolean;
  backlinksEnabled: boolean;
  tagsEnabled: boolean;
  hoverPreviewEnabled: boolean;
  markdownZipEnabled: boolean;
  spacedRepetitionEnabled: boolean;
  spacedRepetitionTags: string[];
  baseStyleCssDisabled: boolean;
  baseJavascriptJsDisabled: boolean;
}

/**
 * Resolves the effective generation options using:
 * - site override (if present)
 * - else global app config (if present)
 * - else default (true for most options, false for hover preview)
 *
 * Note: tags require backlinks; if backlinks are disabled, tags are forced off.
 */
export function resolveEffectiveGenerationOptions(
  appConfig: AppConfig | undefined,
  siteConfig: SiteConfig | undefined
): EffectiveGenerationOptions {
  const breadcrumbsEnabled = (siteConfig?.generationBreadcrumbsEnabled ?? appConfig?.generationBreadcrumbsEnabled) !== false;
  const backlinksEnabled = (siteConfig?.generationBacklinksEnabled ?? appConfig?.generationBacklinksEnabled) !== false;
  const rawTagsEnabled = (siteConfig?.generationTagsEnabled ?? appConfig?.generationTagsEnabled) !== false;
  const tagsEnabled = rawTagsEnabled && backlinksEnabled;
  const hoverPreviewEnabled = (siteConfig?.generationHoverPreviewEnabled ?? appConfig?.generationHoverPreviewEnabled) === true;
  const markdownZipEnabled = (siteConfig?.generationMarkdownZipEnabled ?? appConfig?.generationMarkdownZipEnabled) === true;
  const spacedRepetitionEnabled = (siteConfig?.generationSpacedRepetitionEnabled ?? appConfig?.generationSpacedRepetitionEnabled) === true;
  const spacedRepetitionTags = siteConfig?.generationSpacedRepetitionTags
    ?? appConfig?.generationSpacedRepetitionTags
    ?? [];

  const baseStyleCssDisabled = (siteConfig?.disableBaseStyleCss ?? appConfig?.disableBaseStyleCss) === true;
  const baseJavascriptJsDisabled = (siteConfig?.disableBaseJavascriptJs ?? appConfig?.disableBaseJavascriptJs) === true;

  return { breadcrumbsEnabled, backlinksEnabled, tagsEnabled, hoverPreviewEnabled, markdownZipEnabled, spacedRepetitionEnabled, spacedRepetitionTags, baseStyleCssDisabled, baseJavascriptJsDisabled };
}
