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
 * Utility functions for managing app config.
 * These are shared between the main app and dev tools.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { randomUUID } from "crypto";
import YAML from "yaml";
import { AppConfig, CalloutDismissals } from "../types/appConfig.js";
import { BootstrapConfig } from "../types/bootstrapConfig.js";
import { AppConfigPaths } from "../paths/appConfigPaths.js";
import { getPlatformPaths } from "../paths/getPlatformPaths.js";

/**
 * Gets the bootstrap config path (~/.config/meadow/bootstrap_config.yaml).
 * This file can optionally specify where the meadow home directory is located.
 */
export function getBootstrapConfigPath(): string {
  return getPlatformPaths().bootstrapConfigPath;
}

/**
 * Loads bootstrap config from ~/.config/meadow/bootstrap_config.yaml
 * Returns empty object if file doesn't exist
 */
export function loadBootstrapConfig(): BootstrapConfig {
  return getPlatformPaths().loadBootstrapConfig();
}

/**
 * Gets the meadow home directory path.
 * Priority (highest to lowest):
 * 1. MEADOW_HOME_DIRECTORY_OVERRIDE environment variable
 * 2. meadowHomeDirectoryOverride in ~/.config/meadow/bootstrap_config.yaml
 * 3. Platform default (Mac: ~/Library/Application Support/Meadow/MeadowHome)
 */
export function getDefaultConfigDirectory(): string {
  return getPlatformPaths().getConfigDirectory();
}

/**
 * Gets the path to the app config file
 */
export function getAppConfigPath(configDir?: string): string {
  const dir = configDir || getDefaultConfigDirectory();
  return AppConfigPaths.getAppConfigFile(dir);
}

/**
 * Checks if the app config file exists
 */
export function appConfigFileExists(configDir?: string): boolean {
  return existsSync(getAppConfigPath(configDir));
}

/**
 * Checks if the config directory exists
 */
export function configDirectoryExists(configDir?: string): boolean {
  const dir = configDir || getDefaultConfigDirectory();
  return existsSync(dir);
}

/**
 * Loads app config from file. Returns default config if file doesn't exist.
 * Provider-specific secrets live in each provider's own pp_secrets.yaml,
 * not here.
 */
export function loadAppConfig(configDir?: string): AppConfig {
  const path = getAppConfigPath(configDir);
  if (existsSync(path)) {
    try {
      const content = readFileSync(path, "utf8");
      return YAML.parse(content) as AppConfig;
    } catch (error) {
      console.warn("Error loading app config:", error);
    }
  }
  return { version: "1.0.0" };
}

/**
 * Ensures app config exists on disk and includes defaults for publish options.
 * - Does NOT override explicit false values.
 * - Enforces: tags require backlinks.
 *
 * Returns the effective settings plus a `wasPatched` flag that is true if
 * this call wrote to disk (either because the file didn't exist, or because
 * defaults were patched into an existing file). Callers that want their
 * git history to reflect the true config state should commit when
 * `wasPatched` is true.
 */
export function ensureAppConfigInitialized(
  configDir?: string,
  _isDev?: boolean
): { config: AppConfig; wasPatched: boolean } {
  const settings = loadAppConfig(configDir);

  let changed = false;

  if (settings.manageGitAutomatically === undefined) {
    settings.manageGitAutomatically = true;
    changed = true;
  }
  if (settings.generationBreadcrumbsEnabled === undefined) {
    settings.generationBreadcrumbsEnabled = true;
    changed = true;
  }
  if (settings.generationBacklinksEnabled === undefined) {
    settings.generationBacklinksEnabled = true;
    changed = true;
  }
  if (settings.generationTagsEnabled === undefined) {
    settings.generationTagsEnabled = true;
    changed = true;
  }
  if (settings.generationHoverPreviewEnabled === undefined) {
    settings.generationHoverPreviewEnabled = false;
    changed = true;
  }
  if (settings.generationMarkdownZipEnabled === undefined) {
    settings.generationMarkdownZipEnabled = false;
    changed = true;
  }
  if (settings.generationSpacedRepetitionEnabled === undefined) {
    settings.generationSpacedRepetitionEnabled = false;
    changed = true;
  }
  if (settings.generationSpacedRepetitionTags === undefined) {
    settings.generationSpacedRepetitionTags = [];
    changed = true;
  }
  if (settings.logRotationIntervalSecs === undefined) {
    settings.logRotationIntervalSecs = 86400; // 1 day
    changed = true;
  }
  if (settings.logRetentionSecs === undefined) {
    settings.logRetentionSecs = 1209600; // 14 days
    changed = true;
  }
  if (settings.appAutoUpdateCheckEnabled === undefined) {
    settings.appAutoUpdateCheckEnabled = true;
    changed = true;
  }
  if (settings.appAutoUpdateCheckIntervalSecs === undefined) {
    settings.appAutoUpdateCheckIntervalSecs = 86400; // 1 day
    changed = true;
  }
  if (settings.meadowDeviceGuid === undefined) {
    settings.meadowDeviceGuid = randomUUID();
    changed = true;
  }
  // Enforce dependency: tags require backlinks
  if (settings.generationBacklinksEnabled === false && settings.generationTagsEnabled !== false) {
    settings.generationTagsEnabled = false;
    changed = true;
  }

  // Create/patch file if needed.
  if (!appConfigFileExists(configDir)) {
    changed = true;
  }

  if (changed) {
    saveAppConfig(settings, configDir);
  }

  return { config: settings, wasPatched: changed };
}

/**
 * Saves app config to file. Creates the config directory if it doesn't exist.
 */
export function saveAppConfig(settings: AppConfig, configDir?: string): void {
  const path = getAppConfigPath(configDir);
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const toWrite: AppConfig = { ...settings, version: "1.0.0" };
  writeFileSync(path, YAML.stringify(toWrite), "utf8");
}

/**
 * Updates the allowImagesToExtendToFrontier setting
 * Pass undefined to remove the setting (will use default)
 */
export function updateAllowImagesToExtendToFrontier(value: boolean | undefined, configDir?: string): AppConfig {
  const settings = loadAppConfig(configDir);
  
  if (value === undefined) {
    delete settings.allowImagesToExtendToFrontier;
  } else {
    settings.allowImagesToExtendToFrontier = value;
  }
  
  saveAppConfig(settings, configDir);
  return settings;
}

/**
 * Updates the manageGitAutomatically setting.
 * Pass undefined to remove the setting (will use default true).
 */
export function updateManageGitAutomatically(value: boolean | undefined, configDir?: string): AppConfig {
  const settings = loadAppConfig(configDir);

  if (value === undefined) {
    delete settings.manageGitAutomatically;
  } else {
    settings.manageGitAutomatically = value;
  }

  saveAppConfig(settings, configDir);
  return settings;
}

/**
 * Updates publish options defaults.
 * Pass undefined for a field to leave it unchanged.
 * Pass null for a field to delete it (reset to default).
 *
 * Note: tags require backlinks; if backlinks are set false, tags will also be set false.
 */
export function updateGenerationOptions(
  updates: {
    generationBreadcrumbsEnabled?: boolean | null;
    generationBacklinksEnabled?: boolean | null;
    generationTagsEnabled?: boolean | null;
    generationHoverPreviewEnabled?: boolean | null;
    generationMarkdownZipEnabled?: boolean | null;
    generationSpacedRepetitionEnabled?: boolean | null;
    generationSpacedRepetitionTags?: string[] | null;
  },
  configDir?: string
): AppConfig {
  const settings = loadAppConfig(configDir);

  const setOrDelete = <K extends keyof AppConfig>(key: K, value: AppConfig[K] | null | undefined) => {
    if (value === undefined) return;
    if (value === null) {
      delete settings[key];
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settings as any)[key] = value;
  };

  setOrDelete('generationBreadcrumbsEnabled', updates.generationBreadcrumbsEnabled);
  setOrDelete('generationBacklinksEnabled', updates.generationBacklinksEnabled);
  setOrDelete('generationTagsEnabled', updates.generationTagsEnabled);
  setOrDelete('generationHoverPreviewEnabled', updates.generationHoverPreviewEnabled);
  setOrDelete('generationMarkdownZipEnabled', updates.generationMarkdownZipEnabled);
  setOrDelete('generationSpacedRepetitionEnabled', updates.generationSpacedRepetitionEnabled);
  setOrDelete(
    'generationSpacedRepetitionTags',
    updates.generationSpacedRepetitionTags?.map(tag => tag.trim()).filter(tag => tag.length > 0)
  );

  // Enforce dependency: tags require backlinks (effective, and also when explicitly setting backlinks false).
  const backlinksEffective = settings.generationBacklinksEnabled !== false;
  if (!backlinksEffective) {
    settings.generationTagsEnabled = false;
  }

  saveAppConfig(settings, configDir);
  return settings;
}

/**
 * Updates a callout dismissal state
 * Used to track which callout dismissal states have been set so they don't show again
 */
export function updateCalloutDismissal(
  calloutKey: keyof CalloutDismissals,
  dismissed: boolean,
  configDir?: string
): AppConfig {
  const settings = loadAppConfig(configDir);

  if (!settings.calloutDismissals) {
    settings.calloutDismissals = {};
  }

  settings.calloutDismissals[calloutKey] = dismissed;

  saveAppConfig(settings, configDir);
  return settings;
}

/**
 * Updates the appAutoUpdateCheckLastChecked timestamp in app config.
 */
export function updateAutoUpdateLastChecked(timestamp: string, configDir?: string): AppConfig {
  const settings = loadAppConfig(configDir);
  settings.appAutoUpdateCheckLastChecked = timestamp;
  saveAppConfig(settings, configDir);
  return settings;
}
