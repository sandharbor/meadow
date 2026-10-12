/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { getAllBackendProviders } from './providerRegistry.js';
import type { PrepareBundleRenamePublicationOptions } from './IPublishingProviderBackend.js';
import { deleteLocalBundleOnlyAfterProviderCleanup } from './bundleDeletion.js';

export function getBundlePublicationSummaries(bundleSlug: string) {
  return getAllBackendProviders().flatMap(provider => provider.getBundlePublicationSummaries?.(bundleSlug) ?? []);
}

export function getBundleRenamePublicationPlans(bundleSlug: string) {
  return getAllBackendProviders().flatMap(provider => {
    const plan = provider.getBundleRenamePublicationPlan?.(bundleSlug);
    return plan ? [plan] : [];
  });
}

export async function prepareBundleRenamePublication(providerId: string, options: PrepareBundleRenamePublicationOptions, restorePublishSlug: string): Promise<void> {
  const provider = getAllBackendProviders().find(item => item.manifest.id === providerId);
  if (!provider?.prepareBundleRenamePublication) {
    throw new Error(`${provider?.manifest.displayName ?? providerId} cannot prepare a bundle rename`);
  }
  try {
    await provider.prepareBundleRenamePublication(options);
  } catch (error) {
    // A failing preparation can already have changed provider state. Undo it
    // before the caller rolls back earlier providers and the local bundle.
    try { await provider.cancelPendingBundleRenamePublication?.(options.bundleSlug, restorePublishSlug); }
    catch { /* Preserve the preparation failure as the authoritative error. */ }
    throw error;
  }
}

export async function cancelBundleRenamePublication(providerId: string, bundleSlug: string, restorePublishSlug: string): Promise<void> {
  const provider = getAllBackendProviders().find(item => item.manifest.id === providerId);
  await provider?.cancelPendingBundleRenamePublication?.(bundleSlug, restorePublishSlug);
}

export async function undoBundleRenamePublication(providerId: string, bundleSlug: string, restorePublishSlug: string): Promise<void> {
  const provider = getAllBackendProviders().find(item => item.manifest.id === providerId);
  const plan = provider?.getBundleRenamePublicationPlan?.(bundleSlug);
  if (plan && plan.currentPublishSlug !== restorePublishSlug && plan.currentPublicUrl?.includes(`-${plan.currentPublishSlug}-`)) {
    throw new Error(`The rename has already been published by ${plan.providerDisplayName}`);
  }
  await provider?.cancelPendingBundleRenamePublication?.(bundleSlug, restorePublishSlug);
}

export async function deleteBundleAfterPublicationCleanup(
  options: Omit<Parameters<typeof deleteLocalBundleOnlyAfterProviderCleanup>[0], 'providers'>,
): Promise<void> {
  await deleteLocalBundleOnlyAfterProviderCleanup({ ...options, providers: getAllBackendProviders() });
}
