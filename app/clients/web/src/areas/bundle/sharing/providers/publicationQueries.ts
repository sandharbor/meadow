/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { getActiveFrontendProvider } from './providerRegistry.js';
import { useActivePublishingProvider } from './useActivePublishingProvider.js';

export async function getPublishedUrl(bundleSlug: string): Promise<string | null> {
  const provider = await getActiveFrontendProvider();
  return provider?.fetchPublishedUrl?.(bundleSlug) ?? null;
}

export async function getPublishedFileCounts(bundleSlug: string): Promise<{ htmlCount: number; otherCount: number } | null> {
  const provider = await getActiveFrontendProvider();
  return provider?.fetchPublishedFileCounts?.(bundleSlug) ?? null;
}

/** Expose only the publishing tab selected by Sharing, without provider capabilities. */
export function usePublishingTab() {
  const provider = useActivePublishingProvider();
  return {
    PublishTabComponent: provider?.PublishTabComponent ?? null,
    publishTabLabel: provider?.manifest.publishTabLabel ?? 'Publish',
  };
}
