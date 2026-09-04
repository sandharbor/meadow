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

import { BundleConfig } from '../../../../../contracts/types/bundleConfig.js';
import { BundleConfigPaths } from '../../../../../shared_code/paths/bundleConfigPaths.js';
import {
  extensibleObjectValidation,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
  yamlDocumentCodec,
} from '../../../../../shared_code/utils/durableDocument.js';

const bundleConfigCodec = yamlDocumentCodec<BundleConfig>(value =>
  extensibleObjectValidation<BundleConfig>(value, record => {
    const booleanFields = [
      'createdFromExample',
      'generationBreadcrumbsEnabled',
      'generationBacklinksEnabled',
      'generationTagsEnabled',
      'generationSearchEnabled',
      'generationHoverPreviewEnabled',
      'generationFolderNavigationEnabled',
      'generationFolderNavigationDefaultOpen',
      'allowImagesToExtendToFrontier',
      'generationMarkdownZipEnabled',
      'generationOpenKnowledgeFormatEnabled',
      'generationSpacedRepetitionEnabled',
      'disableBaseStyleCss',
      'disableBaseJavascriptJs',
    ];
    for (const field of booleanFields) {
      if (record[field] !== undefined && typeof record[field] !== 'boolean') return `$.${field} must be a boolean`;
    }
    for (const field of ['defaultOutlinksDepth', 'defaultInlinksDepth']) {
      if (record[field] !== undefined && (!Number.isInteger(record[field]) || Number(record[field]) < 0)) {
        return `$.${field} must be a non-negative integer`;
      }
    }
    for (const field of ['disabledGlobalFilters', 'disabledGlobalHooks', 'generationSpacedRepetitionTags']) {
      if (record[field] !== undefined && (!Array.isArray(record[field]) || !record[field].every(item => typeof item === 'string'))) {
        return `$.${field} must be an array of strings`;
      }
    }
    return null;
  }),
);

const genericYamlCodec = yamlDocumentCodec<Record<string, unknown>>(value =>
  extensibleObjectValidation<Record<string, unknown>>(value),
);

export function loadBundleConfig(bundleDirectory: string): BundleConfig {
  const configPath = BundleConfigPaths.getBundleConfigFile(bundleDirectory);
  return loadBundleConfigFromPath(configPath);
}

export function saveBundleConfig(bundleDirectory: string, config: BundleConfig): void {
  const configPath = BundleConfigPaths.getBundleConfigFile(bundleDirectory);
  writeDurableDocument({ path: configPath, value: config, codec: bundleConfigCodec });
}

export function loadBundleConfigFromPath(configPath: string): BundleConfig {
  return requireValidDocument<BundleConfig>(
    readDurableDocument(configPath, bundleConfigCodec),
    (): BundleConfig => ({}),
  );
}

export function saveBundleConfigToPath(configPath: string, config: BundleConfig): void {
  writeDurableDocument({ path: configPath, value: config, codec: bundleConfigCodec });
}

export function loadYamlFromPath<T extends Record<string, unknown> = Record<string, unknown>>(configPath: string): T {
  return requireValidDocument(
    readDurableDocument(configPath, genericYamlCodec),
    (): Record<string, unknown> => ({}),
  ) as T;
}

export function saveYamlToPath<T extends Record<string, unknown> = Record<string, unknown>>(configPath: string, data: T): void {
  writeDurableDocument({ path: configPath, value: data, codec: genericYamlCodec });
}

export function updateBundleConfig(bundleDirectory: string, updates: Partial<BundleConfig>): BundleConfig {
  const config = loadBundleConfig(bundleDirectory);
  const updatedConfig = { ...config, ...updates };
  saveBundleConfig(bundleDirectory, updatedConfig);
  return updatedConfig;
}
