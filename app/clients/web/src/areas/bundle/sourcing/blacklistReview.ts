/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeConfig } from '../../../../../../contracts/types/bundleNodeConfig.js';
import type { BlacklistEditResult, BlacklistShortcutUndo } from '../../../../../../contracts/types/blacklistReview.js';
import { apiRequest } from '../../../shared/utils/apiClient.js';

async function request(slug: string, operation: string, body: unknown) {
  const response = await apiRequest(`bundles/${encodeURIComponent(slug)}/sourcing/blacklist${operation}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Unable to update this blacklist.');
  return result;
}
export async function applyBlacklistReview(slug: string, changes: BundleNodeConfig[]): Promise<BlacklistEditResult> {
  const result = await request(slug, '', { changes }) as BlacklistEditResult;
  if (result.mode === 'sourcing' && result.pendingConfiguration) {
    sessionStorage.setItem(`sourceProposalPendingEdit:${slug}`, JSON.stringify(result.pendingConfiguration));
  }
  return result;
}
export async function undoBlacklistReview(slug: string, undo: BlacklistShortcutUndo): Promise<void> {
  await request(slug, '/undo', undo);
}
