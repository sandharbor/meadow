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

import type { SiteConfig } from '../../../../../../shared_code/types/siteConfig.js';
import type {
  OpenKnowledgeFormatIndexSource,
  OpenKnowledgeFormatLogSource
} from './openKnowledgeFormat.js';

export type OpenKnowledgeFormatIndexMode = 'generated' | 'trackedPage';
export type OpenKnowledgeFormatLogMode = 'auto' | 'none' | 'trackedPage';

export function normalizeOpenKnowledgeFormatIndexMode(value: unknown): OpenKnowledgeFormatIndexMode {
  return value === 'trackedPage' ? value : 'generated';
}

export function normalizeOpenKnowledgeFormatLogMode(value: unknown): OpenKnowledgeFormatLogMode {
  return value === 'none' || value === 'trackedPage' ? value : 'auto';
}

export function openKnowledgeFormatIndexSourceFromSiteConfig(siteConfig: SiteConfig): OpenKnowledgeFormatIndexSource {
  const mode = normalizeOpenKnowledgeFormatIndexMode(siteConfig.generationOpenKnowledgeFormatIndexMode);
  if (mode === 'trackedPage') {
    const sourceGraphPath = siteConfig.generationOpenKnowledgeFormatIndexSourcePath;
    if (typeof sourceGraphPath === 'string' && sourceGraphPath.trim()) {
      return { mode: 'trackedPage', sourceGraphPath: sourceGraphPath.trim() };
    }
  }
  return { mode: 'generated' };
}

export function openKnowledgeFormatLogSourceFromSiteConfig(siteConfig: SiteConfig): OpenKnowledgeFormatLogSource {
  const mode = normalizeOpenKnowledgeFormatLogMode(siteConfig.generationOpenKnowledgeFormatLogMode);
  if (mode === 'none') return { mode: 'none' };
  if (mode === 'trackedPage') {
    const sourceGraphPath = siteConfig.generationOpenKnowledgeFormatLogSourcePath;
    if (typeof sourceGraphPath === 'string' && sourceGraphPath.trim()) {
      return { mode: 'trackedPage', sourceGraphPath: sourceGraphPath.trim() };
    }
  }
  return { mode: 'auto' };
}
