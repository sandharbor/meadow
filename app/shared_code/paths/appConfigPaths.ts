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
 * Centralized path definitions for app-level configuration.
 *
 * All paths are relative to the config directory (CONF_DIR).
 * This file defines the structure of:
 *   CONF_DIR/
 *     app/
 *       app_config.yaml
 *       secret_app_config.yaml
 *       hooks/
 *         pageTitleNormalization.ts
 *         markdownProcessing.ts
 *     sites/
 *       {siteSlug}/
 *     migrations.yaml
 *
 * Usage:
 *   import { AppConfigPaths } from 'shared_code/paths/appConfigPaths.js';
 *   // Relative paths (for git operations, etc.)
 *   const relPath = AppConfigPaths.relative.appConfigFile(); // 'app/app_config.yaml'
 *   // Absolute paths
 *   const absPath = AppConfigPaths.getAppConfigFile(configDir);
 */

import { join } from 'path';

// Directory names (single source of truth)
const APP_DIR = 'app';
const SITES_DIR = 'sites';
const HOOKS_DIR = 'hooks';
const CUSTOM_ASSETS_DIR = 'custom_assets';
const CONF_DIR = 'conf';

// File names
const APP_CONFIG_FILE = 'app_config.yaml';
const SECRET_APP_CONFIG_FILE = 'secret_app_config.yaml';
const RESOURCES_FILE = 'resources.yaml';
const RESOURCES_LOCAL_FILE = 'resources.local.yaml';
const MIGRATIONS_FILE = 'migrations.yaml';
const SITE_CONFIG_FILE = 'site_config.yaml';
const SITE_PAGE_CONFIG_FILE = 'site_page_config.yaml';
const PAGE_TITLE_NORMALIZATION_HOOK_FILE = 'pageTitleNormalization.ts';
const MARKDOWN_PROCESSING_HOOK_FILE = 'markdownProcessing.ts';
const HTML_POST_PROCESSING_HOOK_FILE = 'htmlPostProcessing.ts';

export const AppConfigPaths = {
  // ─────────────────────────────────────────────────────────────────
  // Relative paths (relative to config directory)
  // These are the base paths; absolute paths are built from these.
  // ─────────────────────────────────────────────────────────────────
  relative: {
    /** app/ */
    appDir(): string {
      return APP_DIR;
    },

    /** sites/ */
    sitesDir(): string {
      return SITES_DIR;
    },

    /** sites/{siteSlug}/ */
    siteDir(siteSlug: string): string {
      return join(SITES_DIR, siteSlug);
    },

    /** app/hooks/ */
    globalHooksDir(): string {
      return join(APP_DIR, HOOKS_DIR);
    },

    /** app/custom_assets/ */
    globalCustomAssetsDir(): string {
      return join(APP_DIR, CUSTOM_ASSETS_DIR);
    },

    /** app/app_config.yaml */
    appConfigFile(): string {
      return join(APP_DIR, APP_CONFIG_FILE);
    },

    /** app/secret_app_config.yaml */
    secretAppConfigFile(): string {
      return join(APP_DIR, SECRET_APP_CONFIG_FILE);
    },

    /** app/resources.yaml */
    resourcesFile(): string {
      return join(APP_DIR, RESOURCES_FILE);
    },

    /** app/resources.local.yaml */
    resourcesLocalFile(): string {
      return join(APP_DIR, RESOURCES_LOCAL_FILE);
    },

    /** migrations.yaml */
    migrationsFile(): string {
      return MIGRATIONS_FILE;
    },

    /** app/hooks/pageTitleNormalization.ts */
    pageTitleNormalizationHookFile(): string {
      return join(APP_DIR, HOOKS_DIR, PAGE_TITLE_NORMALIZATION_HOOK_FILE);
    },

    /** app/hooks/markdownProcessing.ts */
    markdownProcessingHookFile(): string {
      return join(APP_DIR, HOOKS_DIR, MARKDOWN_PROCESSING_HOOK_FILE);
    },

    /** app/hooks/htmlPostProcessing.ts */
    htmlPostProcessingHookFile(): string {
      return join(APP_DIR, HOOKS_DIR, HTML_POST_PROCESSING_HOOK_FILE);
    },

    /** app/hooks/{hookType}.ts */
    globalHookFile(hookType: 'pageTitleNormalization' | 'markdownProcessing' | 'htmlPostProcessing'): string {
      if (hookType === 'pageTitleNormalization') return join(APP_DIR, HOOKS_DIR, PAGE_TITLE_NORMALIZATION_HOOK_FILE);
      if (hookType === 'markdownProcessing') return join(APP_DIR, HOOKS_DIR, MARKDOWN_PROCESSING_HOOK_FILE);
      return join(APP_DIR, HOOKS_DIR, HTML_POST_PROCESSING_HOOK_FILE);
    },

    /** sites/{siteSlug}/conf/site_config.yaml */
    siteConfigFile(siteSlug: string): string {
      return join(SITES_DIR, siteSlug, CONF_DIR, SITE_CONFIG_FILE);
    },

    /** sites/{siteSlug}/conf/site_page_config.yaml */
    sitePageConfigFile(siteSlug: string): string {
      return join(SITES_DIR, siteSlug, CONF_DIR, SITE_PAGE_CONFIG_FILE);
    },
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute directory paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the app config directory: CONF_DIR/app/
   */
  getAppDir(configDir: string): string {
    return join(configDir, this.relative.appDir());
  },

  /**
   * Get the sites directory: CONF_DIR/sites/
   */
  getSitesDir(configDir: string): string {
    return join(configDir, this.relative.sitesDir());
  },

  /**
   * Get a specific site directory: CONF_DIR/sites/{siteSlug}/
   */
  getSiteDir(configDir: string, siteSlug: string): string {
    return join(configDir, this.relative.siteDir(siteSlug));
  },

  /**
   * Get the global hooks directory: CONF_DIR/app/hooks/
   */
  getGlobalHooksDir(configDir: string): string {
    return join(configDir, this.relative.globalHooksDir());
  },

  /**
   * Get the global custom assets directory: CONF_DIR/app/custom_assets/
   */
  getGlobalCustomAssetsDir(configDir: string): string {
    return join(configDir, this.relative.globalCustomAssetsDir());
  },

  /**
   * Get a specific file in the global custom assets directory
   */
  getGlobalCustomAssetFile(configDir: string, filename: string): string {
    return join(configDir, this.relative.globalCustomAssetsDir(), filename);
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute file paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the app config file path: CONF_DIR/app/app_config.yaml
   */
  getAppConfigFile(configDir: string): string {
    return join(configDir, this.relative.appConfigFile());
  },

  /**
   * Get the secret app config file path: CONF_DIR/app/secret_app_config.yaml
   */
  getSecretAppConfigFile(configDir: string): string {
    return join(configDir, this.relative.secretAppConfigFile());
  },

  /**
   * Get the resources config file path: CONF_DIR/app/resources.yaml
   */
  getResourcesFile(configDir: string): string {
    return join(configDir, this.relative.resourcesFile());
  },

  /**
   * Get the resources local config file path: CONF_DIR/app/resources.local.yaml
   */
  getResourcesLocalFile(configDir: string): string {
    return join(configDir, this.relative.resourcesLocalFile());
  },

  /**
   * Get the migrations file path: CONF_DIR/migrations.yaml
   */
  getMigrationsFile(configDir: string): string {
    return join(configDir, this.relative.migrationsFile());
  },

  /**
   * Get the page title normalization hook file path: CONF_DIR/app/hooks/pageTitleNormalization.ts
   */
  getPageTitleNormalizationHookFile(configDir: string): string {
    return join(configDir, this.relative.pageTitleNormalizationHookFile());
  },

  /**
   * Get the markdown processing hook file path: CONF_DIR/app/hooks/markdownProcessing.ts
   */
  getMarkdownProcessingHookFile(configDir: string): string {
    return join(configDir, this.relative.markdownProcessingHookFile());
  },

  /**
   * Get the html post-processing hook file path: CONF_DIR/app/hooks/htmlPostProcessing.ts
   */
  getHtmlPostProcessingHookFile(configDir: string): string {
    return join(configDir, this.relative.htmlPostProcessingHookFile());
  },

  /**
   * Get a global hook file path by hook type
   */
  getGlobalHookFile(configDir: string, hookType: 'pageTitleNormalization' | 'markdownProcessing' | 'htmlPostProcessing'): string {
    return join(configDir, this.relative.globalHookFile(hookType));
  },

  // ─────────────────────────────────────────────────────────────────
  // Constants for when you need just the directory/file names
  // ─────────────────────────────────────────────────────────────────

  /** The app subdirectory name: 'app' */
  APP_DIR,

  /** The sites subdirectory name: 'sites' */
  SITES_DIR,

  /** The hooks subdirectory name: 'hooks' */
  HOOKS_DIR,

  /** The custom_assets subdirectory name: 'custom_assets' */
  CUSTOM_ASSETS_DIR,

  /** Hook file names */
  HOOK_FILES: {
    pageTitleNormalization: PAGE_TITLE_NORMALIZATION_HOOK_FILE,
    markdownProcessing: MARKDOWN_PROCESSING_HOOK_FILE,
    htmlPostProcessing: HTML_POST_PROCESSING_HOOK_FILE,
  } as const,
};

