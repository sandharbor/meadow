/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { PlaceOwnerDefinition } from '../types.js';

export const bundlesPlaces: PlaceOwnerDefinition = {
  owner: 'bundles',
  surfaces: [
    {
      surface: 'find',
      page: 'bundle-list',
      title: 'Find in bundles',
      // Find narrows the list itself; it opens no dialog.
      history: false,
      parameters: [
        { name: 'vault', description: 'Absolute path of the notes vault', required: true },
        { name: 'folder', description: 'Folder path within the vault', required: true },
        { name: 'page', description: 'Page name to find', required: true },
      ],
    },
    { surface: 'create-bundle', page: 'bundle-list', title: 'Create bundle', dialogName: 'Create New Bundle', history: false, parameters: [] },
    {
      surface: 'edit-bundle',
      page: 'bundle-list',
      title: 'Edit bundle details',
      dialogName: 'Edit Bundle Details',
      history: false,
      parameters: [{ name: 'bundle', description: 'Bundle slug', required: true }],
    },
    {
      surface: 'repair-folder',
      page: 'bundle-list',
      title: 'Relink selected folder',
      dialogName: 'Relink selected folder',
      history: false,
      parameters: [{ name: 'bundle', description: 'Bundle slug', required: true }],
    },
    { surface: 'edit-details', page: 'bundle', title: 'Edit bundle details', dialogName: 'Edit Bundle Details', history: false, parameters: [] },
  ],
  transients: [
    { dialogName: 'Just so you know, the example bundle is complex!', reason: 'A one-time warning before opening the example bundle.' },
  ],
};
