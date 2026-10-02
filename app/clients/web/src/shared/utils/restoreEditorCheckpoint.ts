/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { editorViewLocalPrefix, editorViewSessionPrefix, isEditorViewCheckpoint } from '../../../../../contracts/types/editorViewCheckpoint.js';
import { apiRequest } from './apiClient.js';

let restoredThisLaunch = false;
export function hasRestoredEditorCheckpointView() { return restoredThisLaunch; }

/** Run before rendering so a fresh browser restores views before opening its place. */
export async function restoreEditorCheckpoint() {
  const response = await apiRequest('places/checkpoint-view');
  if (!response.ok) throw new Error('Unable to load the restored checkpoint view.');
  const data = await response.json() as { id?: string; view?: unknown };
  if (!data.id || !isEditorViewCheckpoint(data.view) || localStorage.getItem('meadow.editor-checkpoint-restored') === data.id) return;
  for (const [storage, prefix, entries] of [[localStorage, editorViewLocalPrefix, data.view.local], [sessionStorage, editorViewSessionPrefix, data.view.session]] as const) {
    Object.keys(storage).filter(key => key.startsWith(prefix)).forEach(key => storage.removeItem(key));
    Object.entries(entries).forEach(([key, value]) => storage.setItem(key, value));
  }
  localStorage.setItem('meadow.editor-checkpoint-restored', data.id);
  restoredThisLaunch = true;
}

import type { ParticipatesIn, checkpointViewRestoration } from '../../../../../concepts/index.js';
export type RestoreEditorCheckpointMeadowConceptParticipations = [
  ParticipatesIn<typeof checkpointViewRestoration, 'restore-view', typeof restoreEditorCheckpoint>,
];
