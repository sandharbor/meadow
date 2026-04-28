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

import type { Express } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { IPublishingProviderBackend } from './IPublishingProviderBackend.js';
import { loadProviderConfig } from '../../../shared_code/utils/publishingProviderConfigUtils.js';
import { logger } from '../utils/logging/backendLoggingUtils.js';

/**
 * Backend registry for publishing providers.
 *
 * Discovered by scanning `app/publishing_providers/*` for folders that expose
 * a `backend/index.{js,ts}`. Each module's default export is expected to be
 * an `IPublishingProviderBackend`. Adding a new provider means dropping a
 * folder there — no edit to this file.
 *
 * Discovery runs once at module load via top-level await. The rest of the
 * module exposes synchronous lookups that match the existing call sites.
 * Folders are visited in lexical order so display order is deterministic.
 */

type ProviderModule = { default?: IPublishingProviderBackend };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROVIDERS_DIR = path.resolve(__dirname, '../../../publishing_providers');

async function discoverProviders(): Promise<IPublishingProviderBackend[]> {
  if (!fs.existsSync(PROVIDERS_DIR)) return [];

  const folderIds = fs
    .readdirSync(PROVIDERS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .map((e) => e.name)
    .sort();

  const loaded: IPublishingProviderBackend[] = [];
  for (const folderId of folderIds) {
    const backendDir = path.join(PROVIDERS_DIR, folderId, 'backend');
    const candidates = [
      path.join(backendDir, 'index.js'),
      path.join(backendDir, 'index.ts'),
    ];
    const entrypoint = candidates.find((p) => fs.existsSync(p));
    if (!entrypoint) continue;

    const mod = (await import(pathToFileURL(entrypoint).href)) as ProviderModule;
    const provider = mod.default;
    if (!provider) {
      logger.warn(`Publishing provider at ${entrypoint} is missing a default export`);
      continue;
    }
    if (provider.manifest.id !== folderId) {
      logger.warn(
        `Publishing provider folder '${folderId}' has mismatched manifest id '${provider.manifest.id}'`,
      );
    }
    loaded.push(provider);
  }
  return loaded;
}

const providers: readonly IPublishingProviderBackend[] = await discoverProviders();

export function getAllBackendProviders(): readonly IPublishingProviderBackend[] {
  return providers;
}

export function registerAllProviderRoutes(app: Express): void {
  for (const provider of providers) {
    provider.registerRoutes(app);
  }
}

export function ensureAllProviderResourcesInitialized(configDir: string, isDev: boolean): void {
  for (const provider of providers) {
    provider.ensureResourcesInitialized?.(configDir, isDev);
  }
}

export function getActiveBackendProviders(): IPublishingProviderBackend[] {
  return providers.filter((p) => isProviderActive(p));
}

function isProviderActive(provider: IPublishingProviderBackend): boolean {
  // A provider is active unless its pp_config.yaml sets isActive: false.
  const config = loadProviderConfig<{ isActive?: boolean }>(provider.manifest.id);
  return config.isActive !== false;
}
