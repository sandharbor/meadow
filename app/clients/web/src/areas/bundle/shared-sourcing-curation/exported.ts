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

export { default as CurationComponentEditor, default as SourcingComponentEditor } from './components/BundleNodeTabs.js';
export { useFilterState as useCurationStateFilters, useFilterState as useSourcingStateFilters } from './types/filters.js';
export { createUntrackedNodeSelector as curationQueryCreateUntrackedNodeSelector } from './utils/filterSelectors.js';
export type { EditorOperations as CurationTypeEditorOperations, EditorOperations as SourcingTypeEditorOperations } from './types/editorOperations.js';
export type { IFilter as SourcingTypeGraphFilter } from './types/filters.js';

export { SourceContentComparison as SourcingComponentContentComparison } from './components/SourceContentComparison.js';
export { SourceOrphanDiagnosis as SourcingComponentOrphanDiagnosis } from './components/SourceOrphanDiagnosis.js';
export { useSourceLineCounts as useSourcingStateLineCounts } from './components/SourceLineCounts.js';
