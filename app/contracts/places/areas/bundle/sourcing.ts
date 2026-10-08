/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { PlaceOwnerDefinition } from '../../types.js';

export const sourcingPlaces: PlaceOwnerDefinition = {
  owner: 'sourcing',
  surfaces: [
    { surface: 'source-diff', page: 'bundle', title: 'Changes', dialogName: 'Changes', history: false,
      parameters: [{ name: 'node', description: 'Source locator of the page the dialog describes', required: true }] },
    {
      surface: 'source-review',
      page: 'bundle',
      title: 'Source review',
      history: false,
      parameters: [
        { name: 'review', description: 'The pending source review decision being inspected', values: ['identities', 'conflicts', 'sensitivity', 'refresh', 'exit'] },
        { name: 'identityTab', description: 'The active source identity review tab', values: ['confident', 'input'] },
        { name: 'identityComparison', description: 'Identity and destination of an open captured content comparison' },
        { name: 'details', description: 'Traversal details for a reviewed file, as accepted:<locator> or candidate:<locator>' },
      ],
    },
    {
      surface: 'manage-sources',
      page: 'bundle',
      title: 'Manage sources',
      dialogName: /^(Manage sources|Review sources)$/,
      history: false,
      parameters: [{ name: 'mode', description: 'Manage every source or review unknown references', values: ['manage', 'references'] }],
    },
    { surface: 'source-snapshots', page: 'bundle', title: 'Source snapshots', dialogName: 'Source snapshots', history: false, parameters: [] },
  ],
  extensions: [{ page: 'bundle', surface: 'source-review', parameters: [], dialogNames: ['Source identities', 'Resolve configuration conflicts', 'Review tracking sensitivity', 'Update sources for this change?', 'Exit review', 'Changes'] }],
};
