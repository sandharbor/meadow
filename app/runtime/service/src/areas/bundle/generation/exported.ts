/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/**
 * This area's deliberately narrow public interface.
 *
 * Prefer durable data produced by one area and consumed by the next.
 * Keep cross-area calls few and purposeful. Preserve the usual flow:
 * sourcing → curation → generation → review → sharing.
 *
 * Export capabilities and contracts, not implementation conveniences.
 */

export { default as appShellRouterHooksRoutes } from './routes/hooksRoutes.js';
export { default as appShellRouterCustomAssetsRoutes } from './routes/customAssetsRoutes.js';
export { buildFilteredSourcesExportForBundle as appShellCommandBuildFilteredSourcesExportForBundle } from './sources-export/filteredSourcesExport.js';
export { buildFilteredOpenKnowledgeFormatForBundle as appShellCommandBuildFilteredOpenKnowledgeFormatForBundle } from './open-knowledge-format/filteredOpenKnowledgeFormat.js';
export { default as appShellRouterBundleGenerationRoutes } from './routes/bundleGenerationRoutes.js';
export { generateHtmlForBundle as appShellCommandGenerateHtmlForBundle } from './html/htmlService.js';
export { ensureTrackedPageContent as appShellCommandEnsureTrackedPageContent } from './source-material/trackedPageContent.js';
export { default as appShellRouterStylePresetsRoutes } from './routes/stylePresetsRoutes.js';
export { getHtmlPathForPage as reviewQueryHtmlPathForPage } from './html/htmlPathLookup.js';
