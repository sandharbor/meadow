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

export { SourcingPanel as AppShellComponentSourcingPanel } from './components/SourcingPanel.js';

export { ManageSources as AppShellComponentManageSources } from './components/ManageSources.js';
