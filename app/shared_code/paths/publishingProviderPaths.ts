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
 * Centralized path definitions for publishing-provider configuration and
 * site-scoped cache.
 *
 * Layout:
 *   CONF_DIR/
 *     app/
 *       publishing_providers/
 *         {providerId}/
 *           pp_config.yaml
 *           pp_resources.yaml
 *           pp_secrets.yaml         (gitignored)
 *     sites/
 *       {siteSlug}/
 *         config/
 *           publishing_providers/
 *             {providerId}/
 *               pp_config.yaml      (override of global)
 *               pp_resources.yaml   (override of global)
 *               pp_secrets.yaml     (override of global, gitignored)
 *         cache/
 *           publishing_providers/
 *             {providerId}/         (provider-private cache; subdirs are up to the provider)
 *
 * Site-local config files override global ones via shallow merge. The cache
 * folder is opaque to core: each provider decides what subdirectories and
 * files it wants to keep there.
 */

import { join } from 'path';
import { AppConfigPaths } from './appConfigPaths.js';

const PUBLISHING_PROVIDERS_DIR = 'publishing_providers';
const SITE_CONFIG_DIR = 'config';
const SITE_CACHE_DIR = 'cache';
const PP_CONFIG_FILE = 'pp_config.yaml';
const PP_RESOURCES_FILE = 'pp_resources.yaml';
const PP_RESOURCES_LOCAL_FILE = 'pp_resources.local.yaml';
const PP_SECRETS_FILE = 'pp_secrets.yaml';

export const PublishingProviderPaths = {
  /** app/publishing_providers/ */
  getGlobalProvidersDir(configDir: string): string {
    return join(AppConfigPaths.getAppDir(configDir), PUBLISHING_PROVIDERS_DIR);
  },

  /** app/publishing_providers/{providerId}/ */
  getGlobalProviderDir(configDir: string, providerId: string): string {
    return join(this.getGlobalProvidersDir(configDir), providerId);
  },

  /** app/publishing_providers/{providerId}/pp_config.yaml */
  getGlobalConfigFile(configDir: string, providerId: string): string {
    return join(this.getGlobalProviderDir(configDir, providerId), PP_CONFIG_FILE);
  },

  /** app/publishing_providers/{providerId}/pp_resources.yaml */
  getGlobalResourcesFile(configDir: string, providerId: string): string {
    return join(this.getGlobalProviderDir(configDir, providerId), PP_RESOURCES_FILE);
  },

  /** app/publishing_providers/{providerId}/pp_resources.local.yaml */
  getGlobalResourcesLocalFile(configDir: string, providerId: string): string {
    return join(this.getGlobalProviderDir(configDir, providerId), PP_RESOURCES_LOCAL_FILE);
  },

  /** app/publishing_providers/{providerId}/pp_secrets.yaml */
  getGlobalSecretsFile(configDir: string, providerId: string): string {
    return join(this.getGlobalProviderDir(configDir, providerId), PP_SECRETS_FILE);
  },

  /** sites/{siteSlug}/config/publishing_providers/{providerId}/ */
  getSiteProviderDir(configDir: string, siteSlug: string, providerId: string): string {
    return join(
      AppConfigPaths.getSiteDir(configDir, siteSlug),
      SITE_CONFIG_DIR,
      PUBLISHING_PROVIDERS_DIR,
      providerId,
    );
  },

  /** sites/{siteSlug}/config/publishing_providers/{providerId}/pp_config.yaml */
  getSiteConfigFile(configDir: string, siteSlug: string, providerId: string): string {
    return join(this.getSiteProviderDir(configDir, siteSlug, providerId), PP_CONFIG_FILE);
  },

  /** sites/{siteSlug}/config/publishing_providers/{providerId}/pp_resources.yaml */
  getSiteResourcesFile(configDir: string, siteSlug: string, providerId: string): string {
    return join(this.getSiteProviderDir(configDir, siteSlug, providerId), PP_RESOURCES_FILE);
  },

  /** sites/{siteSlug}/config/publishing_providers/{providerId}/pp_secrets.yaml */
  getSiteSecretsFile(configDir: string, siteSlug: string, providerId: string): string {
    return join(this.getSiteProviderDir(configDir, siteSlug, providerId), PP_SECRETS_FILE);
  },

  /** sites/{siteSlug}/cache/publishing_providers/{providerId}/ */
  getSiteProviderCacheDir(configDir: string, siteSlug: string, providerId: string): string {
    return join(
      AppConfigPaths.getSiteDir(configDir, siteSlug),
      SITE_CACHE_DIR,
      PUBLISHING_PROVIDERS_DIR,
      providerId,
    );
  },

  PUBLISHING_PROVIDERS_DIR,
  PP_CONFIG_FILE,
  PP_RESOURCES_FILE,
  PP_RESOURCES_LOCAL_FILE,
  PP_SECRETS_FILE,
};
