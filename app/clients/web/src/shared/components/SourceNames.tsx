/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import type { BundleSource } from '../../../../../contracts/types/bundleConfig.js';
import { sourceGraphPath, sourceLocationLabel } from '../../../../../shared_code/utils/bundleSourceUtils.js';

type SourceName = Pick<BundleSource, 'id' | 'name'>;
const SourceNames = createContext<readonly SourceName[]>([]);

export function SourceNamesProvider({ sources, children }: { sources: readonly SourceName[]; children: ReactNode }) {
  return <SourceNames.Provider value={sources}>{children}</SourceNames.Provider>;
}

export function useSourcePathFormatter(): (path: string) => string {
  const sources = useContext(SourceNames);
  return useCallback((path: string) => {
    const match = /^(folder:)?\/?_mw_sources\/([a-z0-9]{12})(?:\/(.*))?$/.exec(path);
    const source = match && [...sources].reverse().find(source => source.id === match[2]);
    return source ? sourceLocationLabel(source.name, match?.[3] ?? '') : path;
  }, [sources]);
}

export function useSourcePath(path: string): string {
  return useSourcePathFormatter()(path);
}

/** Keep the source delimiter intact when the file is directly in its source root. */
export function splitSourcePathLabel(value: string) {
  const separator = value.lastIndexOf('/');
  const sourceRoot = separator >= 2 && value.slice(separator - 2, separator + 1) === '://';
  return {
    directory: value.slice(0, sourceRoot ? separator + 1 : Math.max(0, separator)),
    filename: value.slice(separator + 1),
    separator: separator < 0 || sourceRoot ? '' : '/',
  };
}

export function SourceDirectoryLabel({ sourceId, directory }: { sourceId?: string; directory: string }) {
  return <>{useSourcePath(sourceGraphPath(sourceId, directory))}</>;
}
