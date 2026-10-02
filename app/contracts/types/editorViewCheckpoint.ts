/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/** A portable, versioned presentation snapshot, independent of an origin/profile. */
export interface EditorViewCheckpoint {
  version: 1;
  local: Record<string, string>;
  session: Record<string, string>;
}

export const editorViewLocalPrefix = 'meadow.editor-view.v1:';
export const editorViewSessionPrefix = 'sourceProposalPendingEdit:';

export function isEditorViewCheckpoint(value: unknown): value is EditorViewCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<EditorViewCheckpoint>;
  return item.version === 1 && ([['local', editorViewLocalPrefix], ['session', editorViewSessionPrefix]] as const).every(([key, prefix]) => {
    const entries = item[key];
    return entries && typeof entries === 'object' && !Array.isArray(entries)
      && Object.entries(entries).every(([name, content]) => name.startsWith(prefix) && typeof content === 'string' && content.length < 2_000_000);
  });
}
