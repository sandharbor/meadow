/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useState } from 'react';
import type { FolderBundleSelectionValidation } from '../../../../../../contracts/types/folderBundleSelection';
import { apiRequest } from '../../../shared/utils/apiClient';

export function useFolderSelectionValidation(enabled: boolean, sourceDirectory: string, selectedFolders: string[]) {
  const selectionKey = JSON.stringify({ sourceDirectory, selectedFolders });
  const [validation, setValidation] = useState<(FolderBundleSelectionValidation & { selectionKey: string }) | null>(null);

  useEffect(() => {
    setValidation(null);
    if (!enabled || !sourceDirectory.trim() || selectedFolders.length === 0) return;
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await apiRequest('bundles/folders/validate-selection', {
            method: 'POST',
            json: { sourceDirectory, selectedFolders },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('Folder validation failed');
          const result = await response.json() as FolderBundleSelectionValidation;
          if (!cancelled) setValidation({ ...result, selectionKey });
        } catch {
          if (!cancelled) setValidation({
            selectionKey,
            selectionError: 'Could not check these folders. Change the selection or Notes Root to try again.',
            folderErrors: [],
          });
        }
      })();
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, sourceDirectory, selectedFolders, selectionKey]);

  const current = enabled && validation?.selectionKey === selectionKey ? validation : null;
  const missingRoot = enabled && !sourceDirectory.trim();
  const isChecking = enabled && !missingRoot && selectedFolders.length > 0 && !current;
  const selectionError = missingRoot && selectedFolders.length > 0 ? 'Choose a Notes Root for these folders.' : current?.selectionError ?? null;
  const folderErrors = current?.folderErrors ?? [];
  const disabledReason = !enabled ? null
    : missingRoot ? 'Choose a Notes Root before creating the bundle.'
      : selectedFolders.length === 0 ? 'Choose at least one folder to include.'
        : isChecking ? 'Wait while the selected folders are checked.'
          : selectionError || (folderErrors.length > 0
            ? 'Fix the highlighted folders or change the Notes Root before creating the bundle.'
            : null);
  return { selectionError, folderErrors, isChecking, disabledReason };
}
