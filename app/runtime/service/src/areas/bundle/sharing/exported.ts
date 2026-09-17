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

export { createLocalSaveRoutes as appShellCommandCreateLocalSaveRoutes } from './routes/localSaveRoutes.js';
export { default as appShellRouterProviderDiscoveryRoutes } from './routes/providerDiscoveryRoutes.js';
export { default as appShellRouterPublishingCliRoutes } from './routes/publishingCliRoutes.js';
