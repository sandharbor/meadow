/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useRef } from 'react';
import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';
import { readEditorView, writeEditorView } from '../../../../shared/utils/editorViewStorage.js';

export function useEditorSelectionView(options: {
  bundleSlug: string; mode: 'curation' | 'sourcing'; selected: Set<EncodedBundleNodeKey>; collapsed: boolean;
  select: (keys: Set<EncodedBundleNodeKey>) => void; collapse: (value: boolean) => void;
}) {
  const { bundleSlug, mode, selected, collapsed, select, collapse } = options;
  const restore = useRef(readEditorView<{ selected: EncodedBundleNodeKey[]; collapsed: boolean } | null>(bundleSlug, mode, 'selection', null));
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || !restore.current) return;
    applied.current = true;
    select(new Set(restore.current.selected));
    collapse(restore.current.collapsed);
  }, [select, collapse]);
  useEffect(() => {
    if (restore.current) {
      if (JSON.stringify([...selected]) !== JSON.stringify(restore.current.selected) || collapsed !== restore.current.collapsed) return;
      restore.current = null;
    }
    writeEditorView(bundleSlug, mode, 'selection', { selected: [...selected], collapsed });
  }, [bundleSlug, mode, selected, collapsed]);
}
