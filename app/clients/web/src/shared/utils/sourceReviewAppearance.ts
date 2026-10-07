/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/** Shared category colors for source-change highlights and selected-page evidence. */
export const sourceReviewAppearance = {
  added: { label: 'Added', color: '#16a34a', background: '#f0fdf4' },
  moved: { label: 'Renamed', color: '#9333ea', background: '#faf5ff' },
  modified: { label: 'Modified', color: '#2563eb', background: '#eff6ff' },
  departing: { label: 'Removed', color: '#dc2626', background: '#fef2f2' },
  unchanged: { label: 'Unchanged', color: '#737373', background: '#fafafa' },
  frontier: { label: 'Frontier', color: '#d97706', background: '#fffbeb' },
};

/** The removal explanation is identical in the filter tooltip and selected-page disclosure. */
export const sourceRemovalReasons = {
  'source-missing': { label: 'Source missing', description: 'Missing on disk when the proposed capture was made.' },
  unreachable: { label: 'Not reachable', description: 'Excluded by the proposed traversal, links, or blacklist boundaries.' },
  'source-disconnected': { label: 'Disconnected', description: 'Its source was removed from the proposed registry.' },
};
