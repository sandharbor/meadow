/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { PlaceOwnerDefinition } from '../types.js';

/** The application shell composes Preview from several areas' tabs. */
export const appShellPlaces: PlaceOwnerDefinition = {
  owner: 'appShell',
  surfaces: [
    {
      surface: 'preview',
      page: 'bundle',
      title: 'Preview',
      dialogName: 'Preview and publish',
      history: true,
      parameters: [
        { name: 'step', description: 'Preview step', values: ['review', 'share'] },
        { name: 'tab', description: 'Preview tab', values: ['bundle-preview', 'changes', 'versions', 'publish', 'local-export', 'advanced'] },
        { name: 'start', description: 'Source locator of the page the preview starts on' },
        { name: 'customize', description: 'Show the Customize panel', values: ['open'] },
      ],
    },
    {
      surface: 'bundle-logs',
      page: 'bundle',
      title: 'Bundle logs',
      dialogName: 'Bundle logs',
      history: false,
      parameters: [],
    },
  ],
  transients: [
    { dialogName: 'Create New Version', reason: 'A short confirmation form for an action taken inside Preview.' },
    { dialogName: 'OKF Reserved Files Renamed', reason: 'An explanation shown after generation renames reserved files.' },
    { dialogName: 'Software Update', reason: 'Opened by the desktop host when an update is available.' },
    { dialogName: 'Preview', reason: 'A nested preview of one page inside Preview and publish.' },
  ],
};
