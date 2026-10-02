/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useCallback, useContext, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';
import { readEditorView, writeEditorView } from '../../../../shared/utils/editorViewStorage.js';
import { EditorOperationsContext } from '../types/editorOperations.js';

export function useEditorViewValue<T>(bundleSlug: string, name: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const mode = useContext(EditorOperationsContext)?.mode ?? 'curation';
  const [value, setValue] = useState<T>(() => readEditorView(bundleSlug, mode, name, fallback));
  const update = useCallback<Dispatch<SetStateAction<T>>>(change => setValue(previous => {
    const next = typeof change === 'function' ? (change as (previous: T) => T)(previous) : change;
    writeEditorView(bundleSlug, mode, name, next);
    return next;
  }), [bundleSlug, mode, name]);
  return [value, update];
}

export function useEditorKeySet(bundleSlug: string, name: string): [Set<EncodedBundleNodeKey>, Dispatch<SetStateAction<Set<EncodedBundleNodeKey>>>] {
  const [keys, setKeys] = useEditorViewValue<EncodedBundleNodeKey[]>(bundleSlug, name, []);
  const update = useCallback<Dispatch<SetStateAction<Set<EncodedBundleNodeKey>>>>(change => setKeys(previous =>
    [...(typeof change === 'function' ? change(new Set(previous)) : change)]), [setKeys]);
  return [useMemo(() => new Set(keys), [keys]), update];
}

import type { ParticipatesIn, sourceReviewViewState } from '../../../../../../../concepts/index.js';
export type UseEditorViewValueMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceReviewViewState, 'remember-mode-view', typeof useEditorViewValue>,
];
