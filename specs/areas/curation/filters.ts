import { mdc } from '../../mdc.js';
import * as curation from './support.js';

const {
  customFilterConfig,
  customPageSelectorConfig,
  globalCustomFiltersConfig,
  siteCustomFiltersConfig,
  sitePageConfig,
  sitePageConfigUtils,
  globalCustomFilters,
  defaultGlobalFilters,
  siteConfigRoutes,
  customFiltersRoutes,
  siteCurationRoutes,
  filterState,
  filterSelectors,
  displayGraph,
  filterPanel,
} = curation;

export const filtersSpec = mdc`
# Curation Filters

Curation filters are a review layer over the site working graph. They do not
own graph construction. Instead, they select pages from the current graph and
apply presentation or safety actions while site page configuration remains the
durable source for tracking and blacklist state.

## Shared Model

Custom filter persistence is shaped by ${customFilterConfig},
${customPageSelectorConfig}, ${globalCustomFiltersConfig}, and
${siteCustomFiltersConfig}. Site tracking and blacklist state is represented by
${sitePageConfig}.

${sitePageConfigUtils} parses and serializes site page config, applies config
to working-graph pages, and prepares API pages for frontend filtering by
applying sensitive, tracked, and blacklisted state.

${globalCustomFilters} owns global filter file IO, while
${defaultGlobalFilters} seeds the built-in daily-notes sensitive filter unless
the user has deleted it.

## Frontend

${filterState} defines the in-memory filter shape, built-in filters, custom
filter conversion, and the hook that loads custom filters from the backend.

${filterSelectors} contains the pure selector functions that turn a graph into
selected page IDs. Built-in selectors cover tracked, untracked, sensitive,
blacklisted, frontier, title search, depth override, and link-gap cases; custom
selectors match title, path, or content configuration.

${displayGraph} applies enabled filters to graph presentation. Solo and hide
filters affect visibility; actions add highlights, labels, titles, and
effective sensitivity.

${filterPanel} is the primary UI for toggling filters, changing thresholds,
searching by title, and creating or editing custom filters.

## Backend

${siteConfigRoutes} reads and writes the draft and committed site page config
used by the curation UI.

${customFiltersRoutes} exposes site and global custom filter APIs. It merges
global filters with site filters for the frontend, persists edits by scope,
and stores per-site disabled state for global filters.

${siteCurationRoutes} serves the working graph used by the curation surface
and copies accepted tracked pages into site content.
`;

export default filtersSpec;
