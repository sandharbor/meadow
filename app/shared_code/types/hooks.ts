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

export interface PageTitleNormalizationHook {
  pageTitleNormalization(siteSlug: string, pageTitle: string): string;
}

export interface MarkdownProcessingHook {
  markdownProcessingPage(siteSlug: string, mdContent: string): string;
  markdownProcessingBacklinks(siteSlug: string, mdContent: string): string;
}

export interface HtmlPostProcessingHook {
  htmlPostProcessing(siteSlug: string, document: unknown, pageName: string): void;
}

// Hook types
export type HookType = 'pageTitleNormalization' | 'markdownProcessing' | 'htmlPostProcessing';

// Hook scope
export type HookScope = 'global' | 'site';

// Hook metadata
export interface HookMetadata {
  hookType: HookType;
  scope: HookScope;
  exists: boolean;
  content?: string;
  error?: string;
  filePath?: string;
}

// Validation result for a single page
export interface PageValidationDiff {
  pageTitle: string;
  pageSubdirectory: string;
  before: string;
  after: string;
}

// Hook validation result
export interface HookValidationResult {
  success: boolean;
  error?: string;
  affectedPages?: PageValidationDiff[];
  totalAffectedCount?: number;
}

// Hook load status (for error indicator)
export interface HookLoadStatus {
  allLoaded: boolean;
  errors: {
    hookType: HookType;
    scope: HookScope;
    error: string;
  }[];
} 