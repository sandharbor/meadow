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

import { codeRef, typeRef } from '../../mdc.js';
import type {
  CustomFilterConfig,
  CustomPageSelectorConfig,
  GlobalCustomFiltersConfig,
  SiteCustomFiltersConfig,
} from '../../../app/shared_code/types/customFilters.js';
import type { SitePageConfig } from '../../../app/shared_code/types/sitePageConfig.js';
import * as defaultGlobalFiltersModule from '../../../app/shared_code/utils/defaultGlobalFiltersUtils.js';
import * as globalCustomFiltersModule from '../../../app/shared_code/utils/globalCustomFiltersUtils.js';
import * as sitePageConfigUtilsModule from '../../../app/shared_code/utils/sitePageConfigUtils.js';
import customFiltersRoutesModule from '../../../app/backend/src/areas/site/curation/routes/customFiltersRoutes.js';
import siteConfigRoutesModule from '../../../app/backend/src/areas/site/curation/routes/siteConfigRoutes.js';
import siteCurationRoutesModule from '../../../app/backend/src/areas/site/curation/routes/siteCurationRoutes.js';
import FilterPanelComponent from '../../../app/frontend/src/areas/site/curation/components/FilterPanel.js';
import * as displayGraphModule from '../../../app/frontend/src/areas/site/curation/types/displayGraph.js';
import * as filterStateModule from '../../../app/frontend/src/areas/site/curation/types/filters.js';
import * as filterSelectorsModule from '../../../app/frontend/src/areas/site/curation/utils/filterSelectors.js';

export const customFilterConfig = typeRef<CustomFilterConfig>({
  label: 'CustomFilterConfig',
  path: 'app/shared_code/types/customFilters.ts',
  kind: 'type',
});

export const customPageSelectorConfig = typeRef<CustomPageSelectorConfig>({
  label: 'CustomPageSelectorConfig',
  path: 'app/shared_code/types/customFilters.ts',
  kind: 'type',
});

export const globalCustomFiltersConfig = typeRef<GlobalCustomFiltersConfig>({
  label: 'GlobalCustomFiltersConfig',
  path: 'app/shared_code/types/customFilters.ts',
  kind: 'type',
});

export const siteCustomFiltersConfig = typeRef<SiteCustomFiltersConfig>({
  label: 'SiteCustomFiltersConfig',
  path: 'app/shared_code/types/customFilters.ts',
  kind: 'type',
});

export const sitePageConfig = typeRef<SitePageConfig>({
  label: 'SitePageConfig',
  path: 'app/shared_code/types/sitePageConfig.ts',
  kind: 'type',
});

export const sitePageConfigUtils = codeRef(sitePageConfigUtilsModule, {
  label: 'site page config utilities',
  path: 'app/shared_code/utils/sitePageConfigUtils.ts',
  kind: 'module',
});

export const globalCustomFilters = codeRef(globalCustomFiltersModule, {
  label: 'global custom filter storage',
  path: 'app/shared_code/utils/globalCustomFiltersUtils.ts',
  kind: 'module',
});

export const defaultGlobalFilters = codeRef(defaultGlobalFiltersModule, {
  label: 'default global filter initialization',
  path: 'app/shared_code/utils/defaultGlobalFiltersUtils.ts',
  kind: 'module',
});

export const siteConfigRoutes = codeRef(siteConfigRoutesModule, {
  label: 'site config routes',
  path: 'app/backend/src/areas/site/curation/routes/siteConfigRoutes.ts',
  kind: 'module',
});

export const customFiltersRoutes = codeRef(customFiltersRoutesModule, {
  label: 'custom filter routes',
  path: 'app/backend/src/areas/site/curation/routes/customFiltersRoutes.ts',
  kind: 'module',
});

export const siteCurationRoutes = codeRef(siteCurationRoutesModule, {
  label: 'site curation routes',
  path: 'app/backend/src/areas/site/curation/routes/siteCurationRoutes.ts',
  kind: 'module',
});

export const filterState = codeRef(filterStateModule, {
  label: 'filter state',
  path: 'app/frontend/src/areas/site/curation/types/filters.ts',
  kind: 'module',
});

export const filterSelectors = codeRef(filterSelectorsModule, {
  label: 'filter selectors',
  path: 'app/frontend/src/areas/site/curation/utils/filterSelectors.ts',
  kind: 'module',
});

export const displayGraph = codeRef(displayGraphModule, {
  label: 'display graph filter application',
  path: 'app/frontend/src/areas/site/curation/types/displayGraph.ts',
  kind: 'module',
});

export const filterPanel = codeRef(FilterPanelComponent, {
  label: 'filter panel',
  path: 'app/frontend/src/areas/site/curation/components/FilterPanel.tsx',
  kind: 'module',
});
