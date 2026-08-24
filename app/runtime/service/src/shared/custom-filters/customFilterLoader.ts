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

import type {
  BundleCustomFiltersConfig,
  CustomFilterConfig,
} from '../../../../../contracts/types/customFilters.js';
import { bundleCustomFiltersCodec } from '../../../../../shared_code/utils/configDocumentCodecs.js';
import {
  readDurableDocument,
  requireValidDocument,
} from '../../../../../shared_code/utils/durableDocument.js';
import { loadGlobalCustomFilters } from '../../../../../shared_code/utils/globalCustomFiltersUtils.js';
import {
  getBundleConfigPath,
  getBundleDirectory,
  getConfigDirectory,
} from '../bundle-config/bundleConfigPaths.js';
import { loadBundleConfig } from '../utils/bundleConfigUtils.js';

function loadBundleCustomFilters(bundleSlug: string): BundleCustomFiltersConfig {
  return requireValidDocument(
    readDurableDocument(
      getBundleConfigPath(bundleSlug, 'custom_filters.json'),
      bundleCustomFiltersCodec,
    ),
    (): BundleCustomFiltersConfig => ({ filters: [], version: '1.0.0' }),
  );
}

export function loadCustomFiltersForBundle(bundleSlug: string): CustomFilterConfig[] {
  const globalConfig = loadGlobalCustomFilters(getConfigDirectory());
  const bundleConfig = loadBundleCustomFilters(bundleSlug);
  const bundle = loadBundleConfig(getBundleDirectory(bundleSlug));
  const disabledGlobalFilters = bundle.disabledGlobalFilters || [];

  return [
    ...globalConfig.filters.map(filter => ({
      ...filter,
      scope: 'global' as const,
      enabled: !disabledGlobalFilters.includes(filter.id),
    })),
    ...bundleConfig.filters.map(filter => ({ ...filter, scope: 'bundle' as const })),
  ];
}
