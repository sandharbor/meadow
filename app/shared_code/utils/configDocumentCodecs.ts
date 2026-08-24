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

import type { AppConfig } from '../../contracts/types/appConfig.js';
import type { BootstrapConfig } from '../../contracts/types/bootstrapConfig.js';
import type {
  CustomBundleNodeSelectorConfig,
  CustomFilterAction,
  BundleCustomFiltersConfig,
  GlobalCustomFiltersConfig,
} from '../../contracts/types/customFilters.js';
import type { ResourcesConfig } from '../../contracts/types/resourcesConfig.js';
import {
  extensibleObjectValidation,
  isPlainObject,
  jsonDocumentCodec,
  yamlDocumentCodec,
} from './durableDocument.js';

function knownFieldType(
  record: Record<string, unknown>,
  fields: readonly string[],
  predicate: (value: unknown) => boolean,
  expected: string,
): string | null {
  for (const field of fields) {
    if (record[field] !== undefined && !predicate(record[field])) {
      return `$.${field} must be ${expected}`;
    }
  }
  return null;
}

const APP_BOOLEAN_FIELDS = [
  'manageGitAutomatically',
  'allowImagesToExtendToFrontier',
  'generationBreadcrumbsEnabled',
  'generationBacklinksEnabled',
  'generationTagsEnabled',
  'generationSearchEnabled',
  'generationHoverPreviewEnabled',
  'generationFolderNavigationEnabled',
  'generationMarkdownZipEnabled',
  'generationOpenKnowledgeFormatEnabled',
  'generationSpacedRepetitionEnabled',
  'appAutoUpdateCheckEnabled',
  'disableBaseStyleCss',
  'disableBaseJavascriptJs',
] as const;
const APP_STRING_FIELDS = [
  'version',
  'appAutoUpdateCheckLastChecked',
  'meadowDeviceGuid',
  'globalStylePresetId',
] as const;
const APP_POSITIVE_NUMBER_FIELDS = [
  'logRotationIntervalSecs',
  'logRetentionSecs',
  'appAutoUpdateCheckIntervalSecs',
] as const;

function validateAppConfig(value: unknown) {
  return extensibleObjectValidation<AppConfig>(value, record => {
    const booleanError = knownFieldType(record, APP_BOOLEAN_FIELDS, item => typeof item === 'boolean', 'a boolean');
    if (booleanError) return booleanError;
    const stringError = knownFieldType(record, APP_STRING_FIELDS, item => typeof item === 'string', 'a string');
    if (stringError) return stringError;
    const numberError = knownFieldType(
      record,
      APP_POSITIVE_NUMBER_FIELDS,
      item => typeof item === 'number' && Number.isFinite(item) && item > 0,
      'a positive number',
    );
    if (numberError) return numberError;
    if (
      record.generationSpacedRepetitionTags !== undefined &&
      (!Array.isArray(record.generationSpacedRepetitionTags) ||
        !record.generationSpacedRepetitionTags.every(item => typeof item === 'string'))
    ) {
      return '$.generationSpacedRepetitionTags must be an array of strings';
    }
    if (
      record.deletedDefaultFilterIds !== undefined &&
      (!Array.isArray(record.deletedDefaultFilterIds) ||
        !record.deletedDefaultFilterIds.every(item => typeof item === 'string'))
    ) {
      return '$.deletedDefaultFilterIds must be an array of strings';
    }
    if (record.logLevelOverride !== undefined && !['debug', 'info', 'warn', 'error'].includes(String(record.logLevelOverride))) {
      return '$.logLevelOverride must be one of debug, info, warn, or error';
    }
    if (record.calloutDismissals !== undefined) {
      if (!isPlainObject(record.calloutDismissals)) return '$.calloutDismissals must be an object';
      for (const [key, fieldValue] of Object.entries(record.calloutDismissals)) {
        if (typeof fieldValue !== 'boolean') return `$.calloutDismissals.${key} must be a boolean`;
      }
    }
    return null;
  });
}

function validateResourcesConfig(value: unknown) {
  return extensibleObjectValidation<ResourcesConfig>(value, record => {
    const stringError = knownFieldType(
      record,
      ['appUpdateDNSName', 'logDirectory'],
      item => typeof item === 'string',
      'a string',
    );
    if (stringError) return stringError;
    return knownFieldType(
      record,
      ['backendPort', 'frontendPort', 'devToolsPort', 'devToolsServerPort'],
      item => Number.isInteger(item) && Number(item) >= 1 && Number(item) <= 65535,
      'an integer between 1 and 65535',
    );
  });
}

function validateBootstrapConfig(value: unknown) {
  if (!isPlainObject(value)) return { valid: false as const, diagnostic: '$ must be an object' };
  for (const field of Object.keys(value)) {
    if (field !== 'meadowHomeDirectoryOverride') {
      return { valid: false as const, diagnostic: `$.${field} is not supported` };
    }
  }
  if (
    value.meadowHomeDirectoryOverride !== undefined &&
    (typeof value.meadowHomeDirectoryOverride !== 'string' || value.meadowHomeDirectoryOverride.trim() === '')
  ) {
    return {
      valid: false as const,
      diagnostic: '$.meadowHomeDirectoryOverride must be a non-empty string',
    };
  }
  return { valid: true as const, value: value as BootstrapConfig };
}

function validateSelector(value: unknown): value is CustomBundleNodeSelectorConfig {
  if (!isPlainObject(value)) return false;
  return (
    ['title', 'path', 'content'].includes(String(value.field)) &&
    ['substring', 'regex'].includes(String(value.matchType)) &&
    typeof value.value === 'string' &&
    (value.caseSensitive === undefined || typeof value.caseSensitive === 'boolean')
  );
}

function validateAction(value: unknown): value is CustomFilterAction {
  if (!isPlainObject(value) || !['highlight', 'mark_sensitive'].includes(String(value.type))) return false;
  return (
    (value.color === undefined || typeof value.color === 'string') &&
    (value.isDashed === undefined || typeof value.isDashed === 'boolean')
  );
}

function validateFilter(value: unknown, index: number): string | null {
  const prefix = `$.filters[${index}]`;
  if (!isPlainObject(value)) return `${prefix} must be an object`;
  for (const field of ['id', 'name', 'createdAt', 'updatedAt']) {
    if (typeof value[field] !== 'string') return `${prefix}.${field} must be a string`;
  }
  if (value.note !== undefined && typeof value.note !== 'string') return `${prefix}.note must be a string`;
  if (!['global', 'bundle'].includes(String(value.scope))) return `${prefix}.scope is invalid`;
  if (!['union', 'intersection'].includes(String(value.selectorApplicationCriteria))) {
    return `${prefix}.selectorApplicationCriteria is invalid`;
  }
  if (typeof value.enabled !== 'boolean') return `${prefix}.enabled must be a boolean`;
  if (!Array.isArray(value.selectors)) return `${prefix}.selectors must be an array`;
  for (let selectorIndex = 0; selectorIndex < value.selectors.length; selectorIndex += 1) {
    if (!validateSelector(value.selectors[selectorIndex])) {
      return `${prefix}.selectors[${selectorIndex}] is invalid`;
    }
  }
  if (!Array.isArray(value.actions)) return `${prefix}.actions must be an array`;
  for (let actionIndex = 0; actionIndex < value.actions.length; actionIndex += 1) {
    if (!validateAction(value.actions[actionIndex])) return `${prefix}.actions[${actionIndex}] is invalid`;
  }
  return null;
}

function validateGlobalCustomFilters(value: unknown) {
  if (!isPlainObject(value)) return { valid: false as const, diagnostic: '$ must be an object' };
  if (!Array.isArray(value.filters)) {
    return { valid: false as const, diagnostic: '$.filters must be an array' };
  }
  if (typeof value.version !== 'string') {
    return { valid: false as const, diagnostic: '$.version must be a string' };
  }
  for (let index = 0; index < value.filters.length; index += 1) {
    const filterError = validateFilter(value.filters[index], index);
    if (filterError) return { valid: false as const, diagnostic: filterError };
  }
  return { valid: true as const, value: value as unknown as GlobalCustomFiltersConfig };
}

export const appConfigCodec = yamlDocumentCodec(validateAppConfig);
export const resourcesConfigCodec = yamlDocumentCodec(validateResourcesConfig);
export const bootstrapConfigCodec = yamlDocumentCodec(validateBootstrapConfig);
export const globalCustomFiltersCodec = jsonDocumentCodec(validateGlobalCustomFilters);
export const bundleCustomFiltersCodec = jsonDocumentCodec<BundleCustomFiltersConfig>(
  validateGlobalCustomFilters,
);

export function extensibleYamlObjectCodec<T extends object>() {
  return yamlDocumentCodec<T>(value => extensibleObjectValidation<T>(value));
}
