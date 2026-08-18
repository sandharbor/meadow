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
 * Utility functions for managing resources config.
 * Resources config holds infrastructure-level settings (DNS names, S3 buckets, etc.)
 * that were previously mixed into app_config.yaml.
 *
 * Supports a resources.local.yaml override file for per-copy customization.
 */

import { ResourcesConfig } from "../types/resourcesConfig.js";
import { AppConfigPaths } from "../paths/appConfigPaths.js";
import { getDefaultConfigDirectory } from "./appConfigUtils.js";
import { resourcesConfigCodec } from "./configDocumentCodecs.js";
import {
  DurableDocumentResult,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from "./durableDocument.js";

/**
 * Gets the path to the resources config file
 */
export function getResourcesConfigPath(configDir?: string): string {
  const dir = configDir || getDefaultConfigDirectory();
  return AppConfigPaths.getResourcesFile(dir);
}

/**
 * Gets the path to the resources local config file (overrides)
 */
export function getResourcesLocalConfigPath(configDir?: string): string {
  const dir = configDir || getDefaultConfigDirectory();
  return AppConfigPaths.getResourcesLocalFile(dir);
}

/**
 * Loads resources config from file, merging with local overrides.
 * Returns empty config if file doesn't exist.
 */
export function loadResourcesConfig(configDir?: string): ResourcesConfig {
  const { base, local } = readResourceLayers(configDir);
  return { ...base, ...local };
}

function valueOrEmpty(result: DurableDocumentResult<ResourcesConfig>): ResourcesConfig {
  return requireValidDocument(result, () => ({}));
}

function readResourceLayers(configDir?: string): {
  base: ResourcesConfig;
  local: ResourcesConfig;
  baseResult: DurableDocumentResult<ResourcesConfig>;
} {
  const baseResult = readDurableDocument(getResourcesConfigPath(configDir), resourcesConfigCodec);
  const localResult = readDurableDocument(getResourcesLocalConfigPath(configDir), resourcesConfigCodec);
  return {
    base: valueOrEmpty(baseResult),
    local: valueOrEmpty(localResult),
    baseResult,
  };
}

/**
 * Saves resources config to file.
 * Creates the config directory if it doesn't exist.
 */
export function saveResourcesConfig(config: ResourcesConfig, configDir?: string): void {
  writeDurableDocument({
    path: getResourcesConfigPath(configDir),
    value: config,
    codec: resourcesConfigCodec,
  });
}

/**
 * Ensures the durable resources config exists on disk.
 *
 * Returns the effective config (as loaded and possibly updated).
 */
export function ensureResourcesConfigInitialized(
  configDir?: string
): { config: ResourcesConfig; wasPatched: boolean } {
  const layers = readResourceLayers(configDir);
  const baseConfig = { ...layers.base };

  const wasPatched = layers.baseResult.status === 'missing';
  if (wasPatched) {
    saveResourcesConfig(baseConfig, configDir);
  }

  return { config: { ...baseConfig, ...layers.local }, wasPatched };
}

/**
 * Saves partial config to resources.local.yaml, merging with existing local overrides.
 * This is used to write per-copy infrastructure settings without touching resources.yaml.
 */
export function saveResourcesLocalConfig(config: Partial<ResourcesConfig>, configDir?: string): void {
  const localPath = getResourcesLocalConfigPath(configDir);
  const existing = valueOrEmpty(readDurableDocument(localPath, resourcesConfigCodec));
  const merged = { ...existing, ...config };
  writeDurableDocument({ path: localPath, value: merged, codec: resourcesConfigCodec });
}
