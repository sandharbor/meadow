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

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import YAML from "yaml";
import { ResourcesConfig } from "../types/resourcesConfig.js";
import { AppConfigPaths } from "../paths/appConfigPaths.js";
import { getDefaultConfigDirectory } from "./appConfigUtils.js";

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
  const path = getResourcesConfigPath(configDir);
  let config: ResourcesConfig = {};

  if (existsSync(path)) {
    try {
      const content = readFileSync(path, "utf8");
      config = (YAML.parse(content) as ResourcesConfig) || {};
    } catch (error) {
      console.warn("Error loading resources config:", error);
    }
  }

  // Merge local overrides on top
  const localPath = getResourcesLocalConfigPath(configDir);
  if (existsSync(localPath)) {
    try {
      const localContent = readFileSync(localPath, "utf8");
      const localConfig = (YAML.parse(localContent) as ResourcesConfig) || {};
      config = { ...config, ...localConfig };
    } catch (error) {
      console.warn("Error loading resources local config:", error);
    }
  }

  return config;
}

/**
 * Saves resources config to file.
 * Creates the config directory if it doesn't exist.
 */
export function saveResourcesConfig(config: ResourcesConfig, configDir?: string): void {
  const path = getResourcesConfigPath(configDir);
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const yamlContent = YAML.stringify(config);
  writeFileSync(path, yamlContent, "utf8");
}

/**
 * Ensures resources config exists on disk and includes defaults.
 *
 * Returns the effective config (as loaded and possibly updated).
 */
export function ensureResourcesConfigInitialized(
  configDir?: string
): { config: ResourcesConfig; wasPatched: boolean } {
  const config = loadResourcesConfig(configDir);
  const path = getResourcesConfigPath(configDir);
  const fileExisted = existsSync(path);

  let changed = false;

  if (config.backendPort === undefined) {
    config.backendPort = 3001;
    changed = true;
  }
  if (config.frontendPort === undefined) {
    config.frontendPort = 3000;
    changed = true;
  }

  const wasPatched = !fileExisted || changed;
  if (wasPatched) {
    saveResourcesConfig(config, configDir);
  }

  return { config, wasPatched };
}

/**
 * Saves partial config to resources.local.yaml, merging with existing local overrides.
 * This is used to write per-copy settings (like ports) without touching resources.yaml.
 */
export function saveResourcesLocalConfig(config: Partial<ResourcesConfig>, configDir?: string): void {
  const localPath = getResourcesLocalConfigPath(configDir);
  const dir = dirname(localPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let existing: Partial<ResourcesConfig> = {};
  if (existsSync(localPath)) {
    try {
      const content = readFileSync(localPath, "utf8");
      existing = (YAML.parse(content) as Partial<ResourcesConfig>) || {};
    } catch (error) {
      console.warn("Error loading existing resources local config:", error);
    }
  }

  const merged = { ...existing, ...config };
  const yamlContent = YAML.stringify(merged);
  writeFileSync(localPath, yamlContent, "utf8");
}
