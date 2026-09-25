/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { PlaceOwnerDefinition } from '../../types.js';

export const sourcingPlaces: PlaceOwnerDefinition = {
  owner: 'sourcing',
  surfaces: [
    {
      surface: 'source-review',
      page: 'bundle',
      title: 'Source review',
      dialogName: 'Source changes',
      history: false,
      parameters: [
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
};
