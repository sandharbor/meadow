/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useLinkedSurface } from '../../../../shared/places/placeContext.js';
import { useEditorOperations } from '../types/editorOperations.js';

/** Dialogs belong to the active editor mode, including when opened by a link. */
export function useEditorSurface(...[surface, state, actions]: Parameters<typeof useLinkedSurface>) {
  const { mode } = useEditorOperations();
  useLinkedSurface(surface, state, actions, { editorMode: mode });
}
