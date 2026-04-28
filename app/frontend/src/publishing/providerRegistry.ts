/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Frontend registry for publishing providers.
 *
 * Auto-discovered via Vite's `import.meta.glob` over
 * `app/publishing_providers/{id}/frontend/index.tsx`. Each module is expected
 * to export a default `IPublishingProviderFrontend` instance.
 *
 * Active-provider selection is owned by the backend: `GET
 * /api/publishing-providers` returns each provider's manifest plus an
 * `isActive` flag (driven by `pp_config.yaml.isActive`). Callers reach the
 * currently-active provider via `getActiveFrontendProvider()` (async; caches
 * the fetch). Specific-id lookups are still available for providers that
 * need to coordinate with themselves (e.g. a provider's own component
 * importing its manifest).
 */
import { API_BASE_URL } from '../utils/apiConfig';
import { logger } from '../utils/logger';
import type { IPublishingProviderFrontend } from './IPublishingProviderFrontend.js';
import type {
  PublishingProviderId,
  PublishingProviderManifest,
} from '../../../shared_code/interfaces/IPublishingProvider.js';

type ProviderModule = { default?: IPublishingProviderFrontend; provider?: IPublishingProviderFrontend };

// eager: providers are tiny; Vite needs the literal pattern so paths are
// resolved at build time. This reaches above `src` to the sibling directory.
const modules = import.meta.glob<ProviderModule>(
  '../../../publishing_providers/*/frontend/index.tsx',
  { eager: true },
);

function buildRegistry(): Map<PublishingProviderId, IPublishingProviderFrontend> {
  const map = new Map<PublishingProviderId, IPublishingProviderFrontend>();
  for (const [path, mod] of Object.entries(modules)) {
    const folderMatch = path.match(/publishing_providers\/([^/]+)\/frontend\/index\.tsx$/);
    if (!folderMatch) continue;
    const folderId = folderMatch[1];
    const provider = mod.default ?? mod.provider;
    if (!provider) {
      logger.warn(`Publishing provider at ${path} is missing a default export`);
      continue;
    }
    if (provider.manifest.id !== folderId) {
      logger.warn(
        `Publishing provider folder '${folderId}' has mismatched manifest id '${provider.manifest.id}'`,
      );
    }
    map.set(folderId, provider);
  }
  return map;
}

const registry = buildRegistry();

export function getAllFrontendProviders(): ReadonlyMap<PublishingProviderId, IPublishingProviderFrontend> {
  return registry;
}

export function getFrontendProvider(providerId: PublishingProviderId): IPublishingProviderFrontend | null {
  return registry.get(providerId) ?? null;
}

interface BackendProviderEntry {
  manifest: PublishingProviderManifest;
  isActive: boolean;
}

let activePromise: Promise<PublishingProviderId | null> | null = null;

/**
 * Fetch the currently-active provider id from the backend (cached after the
 * first call). Returns null when no provider is active.
 */
export async function fetchActiveProviderId(): Promise<PublishingProviderId | null> {
  if (!activePromise) {
    activePromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/publishing-providers`);
        if (!res.ok) return null;
        const body = await res.json() as { providers?: BackendProviderEntry[] };
        const firstActive = (body.providers ?? []).find((p) => p.isActive);
        return firstActive?.manifest.id ?? null;
      } catch (err) {
        logger.warn('Failed to fetch active publishing provider:', err);
        return null;
      }
    })();
  }
  return activePromise;
}

/**
 * Resolve the active provider to its frontend module, or null if no active
 * provider is registered on the frontend. Async because it reaches the
 * backend the first time.
 */
export async function getActiveFrontendProvider(): Promise<IPublishingProviderFrontend | null> {
  const id = await fetchActiveProviderId();
  if (!id) return null;
  return registry.get(id) ?? null;
}

/**
 * Reset the cached active-provider lookup. Primarily for tests that change
 * which provider is active at runtime.
 */
export function resetActiveProviderCache(): void {
  activePromise = null;
}
