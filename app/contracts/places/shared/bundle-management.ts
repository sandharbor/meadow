/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { PlaceOwnerDefinition } from '../types.js';

export const bundleManagementPlaces: PlaceOwnerDefinition = {
  owner: 'bundle-management',
  surfaces: [
    { surface: 'rename', page: 'bundle', title: 'Rename bundle', dialogName: 'Rename bundle', history: false, parameters: [] },
    {
      surface: 'rename-bundle',
      page: 'bundle-list',
      title: 'Rename bundle',
      dialogName: 'Rename bundle',
      history: false,
      parameters: [{ name: 'bundle', description: 'Bundle slug', required: true }],
    },
  ],
  transients: [
    { dialogName: 'Delete Bundle', reason: 'A destructive confirmation; it should always be reached deliberately.' },
  ],
};
