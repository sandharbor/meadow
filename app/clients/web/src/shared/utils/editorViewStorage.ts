/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/** Presentation only. Business configuration belongs to its owning area. */
export const EDITOR_VIEW_STORAGE_PREFIX = 'meadow.editor-view.v1:';

export function editorViewStorageKey(bundleSlug: string, mode: 'curation' | 'sourcing') {
  return `${EDITOR_VIEW_STORAGE_PREFIX}${encodeURIComponent(bundleSlug)}:${mode}`;
}

export function readEditorView<T>(bundleSlug: string, mode: 'curation' | 'sourcing', name: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(editorViewStorageKey(bundleSlug, mode)) ?? '{}') as Record<string, T>;
    return value[name] ?? fallback;
  } catch { return fallback; }
}

export function writeEditorView<T>(bundleSlug: string, mode: 'curation' | 'sourcing', name: string, value: T) {
  const key = editorViewStorageKey(bundleSlug, mode);
  try {
    const state = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...state, [name]: value }));
  } catch { /* A full or unavailable storage area must not disable editing. */ }
}
