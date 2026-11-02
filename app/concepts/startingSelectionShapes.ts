/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { coreConceptIds } from './ids.js';

/** The declared report shapes are product starting structures, not source counts. */
export const startingSelectionDocumentIds = {
  'single-file': coreConceptIds.singleFileStart,
  'single-folder': coreConceptIds.singleFolderStart,
  'multiple-folders': coreConceptIds.multipleFolderStart,
  'mixed-starts': coreConceptIds.mixedStartingSelections,
} as const;

export const startingSelectionConceptIds = [coreConceptIds.startingSelection, ...Object.values(startingSelectionDocumentIds)] as const;
