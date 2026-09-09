/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

export type BundleDestination = { page: 'bundle' | 'source-review'; slug: string };

/** A navigation target never refreshes or accepts source material. */
export function bundleDestinationPath(destination: BundleDestination): string {
  const pathname = `/bundle/${encodeURIComponent(destination.slug)}`;
  return destination.page === 'source-review' ? `${pathname}?sourceReview=1` : pathname;
}
