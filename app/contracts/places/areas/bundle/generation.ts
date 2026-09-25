/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { PlaceOwnerDefinition } from '../../types.js';

/** Generation's settings live in Preview's Customize panel. */
export const generationPlaces: PlaceOwnerDefinition = {
  owner: 'generation',
  surfaces: [],
  extensions: [
    {
      page: 'bundle',
      surface: 'preview',
      parameters: [
        {
          name: 'settings',
          description: 'Generation settings dialog within Customize',
          values: ['spaced-repetition-global', 'spaced-repetition-bundle', 'okf', 'folder-navigation'],
        },
        { name: 'prompt', description: 'The Custom Assets & Hooks agent prompt', values: ['agent'] },
        { name: 'hook', description: 'Hook open in the code editor, as global:<hook type> or bundle:<hook type>' },
        { name: 'asset', description: 'Custom asset open in the code editor, as global:<asset type> or bundle:<asset type>' },
      ],
      dialogNames: [
        /^Edit (Global|Bundle) SRS Settings$/,
        'Open Knowledge Format Settings',
        'Folder Navigation Settings',
        'Custom Assets & Hooks Agent Prompt',
        /^Edit hook /,
        /^Edit asset /,
      ],
    },
  ],
  transients: [
    { dialogName: 'Enable Spaced Repetition', reason: 'A consent step within enabling spaced repetition; it belongs to that action.' },
  ],
};
