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
 * the bundle-local override on top of the global file.
 */

import { PublishingProviderPaths } from '../paths/publishingProviderPaths.js';
import { getDefaultConfigDirectory } from './appConfigUtils.js';
import type {
  PublishingProviderConfigBase,
  PublishingProviderSecretsBase,
} from '../../contracts/interfaces/PublishingProviderConfig.js';
import type { PublishingProviderId } from '../../contracts/interfaces/IPublishingProvider.js';
import { extensibleYamlObjectCodec } from './configDocumentCodecs.js';
import { readDurableDocument, requireValidDocument } from './durableDocument.js';

function readYaml<T extends object>(path: string): T | null {
  const result = readDurableDocument(path, extensibleYamlObjectCodec<T>());
  if (result.status === 'missing') return null;
  return requireValidDocument(result, () => ({} as T));
}

function mergeShallow<T extends object>(base: T, override: T | null): T {
  if (!override) return base;
  return { ...base, ...override };
}

export interface LoadProviderConfigOptions {
  configDir?: string;
  bundleSlug?: string;
}

export function loadProviderConfig<
  Config extends PublishingProviderConfigBase = PublishingProviderConfigBase,
>(providerId: PublishingProviderId, options: LoadProviderConfigOptions = {}): Config {
  const configDir = options.configDir ?? getDefaultConfigDirectory();
  const globalPath = PublishingProviderPaths.getGlobalConfigFile(configDir, providerId);
  const base = readYaml<Config>(globalPath) ?? ({} as Config);
  if (!options.bundleSlug) return base;
  const bundlePath = PublishingProviderPaths.getBundleConfigFile(
    configDir,
    options.bundleSlug,
    providerId,
  );
  return mergeShallow(base, readYaml<Config>(bundlePath));
}

export function loadProviderSecrets<
  Secrets extends PublishingProviderSecretsBase = PublishingProviderSecretsBase,
>(providerId: PublishingProviderId, options: LoadProviderConfigOptions = {}): Secrets {
  const configDir = options.configDir ?? getDefaultConfigDirectory();
  const globalPath = PublishingProviderPaths.getGlobalSecretsFile(configDir, providerId);
  const base = readYaml<Secrets>(globalPath) ?? ({} as Secrets);
  if (!options.bundleSlug) return base;
  const bundlePath = PublishingProviderPaths.getBundleSecretsFile(
    configDir,
    options.bundleSlug,
    providerId,
  );
  return mergeShallow(base, readYaml<Secrets>(bundlePath));
}

/**
 * Resources carry infrastructure settings (DNS names, bucket names, etc.)
 * that vary by deployment but aren't secret. Resolution order (lowest to
 * highest priority): global pp_resources.yaml → global pp_resources.local.yaml
 * → bundle-local pp_resources.yaml. The .local file lets a single MeadowHome
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

  if (!options.bundleSlug) return resources;
  const bundlePath = PublishingProviderPaths.getBundleResourcesFile(
    configDir,
    options.bundleSlug,
    providerId,
  );
  return mergeShallow(resources, readYaml<Resources>(bundlePath));
}
