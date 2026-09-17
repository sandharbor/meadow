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

export { default as AppShellComponentSinglePagePreviewCallout } from './components/calloutModals/SinglePagePreviewCallout.js';
export { useSinglePagePreviewCallout as useAppShellStateSinglePagePreviewCallout } from './components/calloutModals/SinglePagePreviewCallout.js';
export { UntrackedPagesButton as AppShellComponentUntrackedPagesButton } from './components/UntrackedPagesButton.js';
export { default as AppShellComponentPreviewChangesTab } from './components/PreviewChangesTab.js';
export { VersionsTab as AppShellComponentVersionsTab } from './components/VersionsTab.js';
export { casualVersionName as appShellQueryCasualVersionName } from './utils/versionLabels.js';
export { versionCreatedDate as appShellQueryVersionCreatedDate } from './utils/versionLabels.js';
