/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { PlaceOwnerDefinition } from '../../types.js';

/** Sharing's Publish tab hosts the active publishing provider. */
export const sharingPlaces: PlaceOwnerDefinition = {
  owner: 'sharing',
  surfaces: [],
  extensions: [
    {
      page: 'bundle',
      surface: 'preview',
      parameters: [
        { name: 'history', description: "The active publishing provider's publication history", values: ['publications'] },
      ],
      dialogNames: ['Publication history'],
    },
  ],
};
