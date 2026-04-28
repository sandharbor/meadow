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
 * Loads pp_config.yaml / pp_secrets.yaml for a publishing provider, merging
 * the site-local override on top of the global file.
 */

import { existsSync, readFileSync } from 'fs';
import YAML from 'yaml';
import { PublishingProviderPaths } from '../paths/publishingProviderPaths.js';
import { getDefaultConfigDirectory } from './appConfigUtils.js';
import type {
  PublishingProviderConfigBase,
  PublishingProviderSecretsBase,
} from '../interfaces/PublishingProviderConfig.js';
import type { PublishingProviderId } from '../interfaces/IPublishingProvider.js';

function readYaml<T extends object>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, 'utf8');
    return (YAML.parse(content) as T) ?? null;
  } catch (error) {
    console.warn(`Error loading provider config at ${path}:`, error);
    return null;
  }
}

function mergeShallow<T extends object>(base: T, override: T | null): T {
  if (!override) return base;
  return { ...base, ...override };
}

export interface LoadProviderConfigOptions {
  configDir?: string;
  siteSlug?: string;
}

export function loadProviderConfig<
  Config extends PublishingProviderConfigBase = PublishingProviderConfigBase,
>(providerId: PublishingProviderId, options: LoadProviderConfigOptions = {}): Config {
  const configDir = options.configDir ?? getDefaultConfigDirectory();
  const globalPath = PublishingProviderPaths.getGlobalConfigFile(configDir, providerId);
  const base = readYaml<Config>(globalPath) ?? ({} as Config);
  if (!options.siteSlug) return base;
  const sitePath = PublishingProviderPaths.getSiteConfigFile(
    configDir,
    options.siteSlug,
    providerId,
  );
  return mergeShallow(base, readYaml<Config>(sitePath));
}

export function loadProviderSecrets<
  Secrets extends PublishingProviderSecretsBase = PublishingProviderSecretsBase,
>(providerId: PublishingProviderId, options: LoadProviderConfigOptions = {}): Secrets {
  const configDir = options.configDir ?? getDefaultConfigDirectory();
  const globalPath = PublishingProviderPaths.getGlobalSecretsFile(configDir, providerId);
  const base = readYaml<Secrets>(globalPath) ?? ({} as Secrets);
  if (!options.siteSlug) return base;
  const sitePath = PublishingProviderPaths.getSiteSecretsFile(
    configDir,
    options.siteSlug,
    providerId,
  );
  return mergeShallow(base, readYaml<Secrets>(sitePath));
}

/**
 * Resources carry infrastructure settings (DNS names, bucket names, etc.)
 * that vary by deployment but aren't secret. Resolution order (lowest to
 * highest priority): global pp_resources.yaml → global pp_resources.local.yaml
 * → site-local pp_resources.yaml. The .local file lets a single MeadowHome
 * override infra without touching the committed global file.
 */
export function loadProviderResources<
  Resources extends PublishingProviderConfigBase = PublishingProviderConfigBase,
>(providerId: PublishingProviderId, options: LoadProviderConfigOptions = {}): Resources {
  const configDir = options.configDir ?? getDefaultConfigDirectory();

  const globalPath = PublishingProviderPaths.getGlobalResourcesFile(configDir, providerId);
  let resources = readYaml<Resources>(globalPath) ?? ({} as Resources);

  const globalLocalPath = PublishingProviderPaths.getGlobalResourcesLocalFile(configDir, providerId);
  resources = mergeShallow(resources, readYaml<Resources>(globalLocalPath));

  if (!options.siteSlug) return resources;
  const sitePath = PublishingProviderPaths.getSiteResourcesFile(
    configDir,
    options.siteSlug,
    providerId,
  );
  return mergeShallow(resources, readYaml<Resources>(sitePath));
}
