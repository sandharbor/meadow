/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/**
 * Shared category labels and colors for source-change highlights and selected-page evidence.
 * Labels name what accepting the proposal would do, not what happened to the source.
 */
export const sourceReviewAppearance = {
  added: { label: 'Add', color: '#16a34a' },
  moved: { label: 'Rename', color: '#9333ea' },
  modified: { label: 'Modify', color: '#2563eb' },
  departing: { label: 'Remove', color: '#dc2626' },
  unchanged: { label: 'Unchanged', color: '#737373' },
  frontier: { label: 'Frontier', color: '#d97706' },
};

/** The removal explanation is identical in the filter tooltip and selected-page disclosure. */
export const sourceRemovalReasons = {
  'source-missing': { label: 'Source missing', description: 'Missing on disk when the proposed capture was made.' },
  'source-disconnected': { label: 'Disconnected', description: 'Its source was removed from the proposed registry. Its files are untouched.' },
  blacklisted: { label: 'Blacklisted', description: 'This page is blacklisted in the proposed configuration.' },
  unreachable: { label: 'Not reachable', description: 'An upstream change breaks the route to this page: a blacklisted page, a removed link, a missing source, or traversal settings.' },
};

/** What a Modify changes. A page can have both. */
export const sourceModificationKinds = {
  source: { label: 'Source change', description: 'The captured file content differs from the accepted capture.' },
  config: { label: 'Config change', description: 'This page’s saved settings differ, such as blacklisting or traversal depth. Tracking choices are listed separately.' },
};
