/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { PlaceOwnerDefinition } from '../../types.js';

/** Review's tabs are composed into Preview by the application shell. */
export const reviewPlaces: PlaceOwnerDefinition = {
  owner: 'review',
  surfaces: [],
  transients: [
    { dialogName: 'Only one page is tracked', reason: 'A callout shown before previewing a bundle with one tracked page.' },
  ],
};
