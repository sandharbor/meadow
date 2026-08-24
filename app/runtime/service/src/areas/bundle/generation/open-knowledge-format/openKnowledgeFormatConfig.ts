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

import type { BundleConfig } from '../../../../../../../shared_code/types/bundleConfig.js';
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

export function openKnowledgeFormatIndexSourceFromBundleConfig(bundleConfig: BundleConfig): OpenKnowledgeFormatIndexSource {
  const mode = normalizeOpenKnowledgeFormatIndexMode(bundleConfig.generationOpenKnowledgeFormatIndexMode);
  if (mode === 'trackedPage') {
    const sourceGraphPath = bundleConfig.generationOpenKnowledgeFormatIndexSourcePath;
    if (typeof sourceGraphPath === 'string' && sourceGraphPath.trim()) {
      return { mode: 'trackedPage', sourceGraphPath: sourceGraphPath.trim() };
    }
  }
  return { mode: 'generated' };
}

export function openKnowledgeFormatLogSourceFromBundleConfig(bundleConfig: BundleConfig): OpenKnowledgeFormatLogSource {
  const mode = normalizeOpenKnowledgeFormatLogMode(bundleConfig.generationOpenKnowledgeFormatLogMode);
  if (mode === 'none') return { mode: 'none' };
  if (mode === 'trackedPage') {
    const sourceGraphPath = bundleConfig.generationOpenKnowledgeFormatLogSourcePath;
    if (typeof sourceGraphPath === 'string' && sourceGraphPath.trim()) {
      return { mode: 'trackedPage', sourceGraphPath: sourceGraphPath.trim() };
    }
  }
  return { mode: 'auto' };
}
