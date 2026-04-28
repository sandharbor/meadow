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
 * Centralized path definitions for site-level configuration.
 *
 * All paths are relative to a site directory (SITE_DIR).
 * This file defines the structure of:
 *   SITE_DIR/
 *     build/
 *       markdown_export/
 *     conf/
 *       site_config.yaml
 *       site_page_config.yaml
 *       custom_filters.json
 *     html/
 *       preview/
 *       published/
 *     raw/
 *       tracked_page_content/
 *       modified_page_content/
 *     hooks/
 *       pageTitleNormalization.ts
 *       markdownProcessing.ts
 *
 * Usage:
 *   import { SiteConfigPaths } from 'shared_code/paths/siteConfigPaths.js';
 *   // Relative paths (relative to site directory)
 *   const relPath = SiteConfigPaths.relative.siteConfigFile(); // 'conf/site_config.yaml'
 *   // Absolute paths
 *   const absPath = SiteConfigPaths.getSiteConfigFile(siteDir);
 */

import { join } from 'path';

// Directory names (single source of truth)
const BUILD_DIR = 'build';
const CONF_DIR = 'conf';
const HTML_DIR = 'html';
const RAW_DIR = 'raw';
const HOOKS_DIR = 'hooks';
const CUSTOM_ASSETS_DIR = 'custom_assets';
const MARKDOWN_EXPORT_DIR = 'markdown_export';
const PREVIEW_DIR = 'preview';
const GENERATED_SITE_VERSIONS_DIR = 'generated_site_versions';
const TRACKED_PAGE_CONTENT_DIR = 'tracked_page_content';
const MODIFIED_PAGE_CONTENT_DIR = 'modified_page_content';
const FONTS_DIR = 'fonts';
const TAGPAGES_DIR = 'x-tagpages';

// File names
const SITE_CONFIG_FILE = 'site_config.yaml';
const SITE_PAGE_CONFIG_FILE = 'site_page_config.yaml';
const CUSTOM_FILTERS_FILE = 'custom_filters.json';
const PAGE_TITLE_NORMALIZATION_HOOK_FILE = 'pageTitleNormalization.ts';
const MARKDOWN_PROCESSING_HOOK_FILE = 'markdownProcessing.ts';
const HTML_POST_PROCESSING_HOOK_FILE = 'htmlPostProcessing.ts';

export const SiteConfigPaths = {
  // ─────────────────────────────────────────────────────────────────
  // Relative paths (relative to site directory)
  // These are the base paths; absolute paths are built from these.
  // ─────────────────────────────────────────────────────────────────
  relative: {
    /** conf/ */
    confDir(): string {
      return CONF_DIR;
    },

    /** html/ */
    htmlDir(): string {
      return HTML_DIR;
    },

    /** html/preview/ */
    previewDir(): string {
      return join(HTML_DIR, PREVIEW_DIR);
    },

    /** html/generated_site_versions/ */
    generatedSiteVersionsDir(): string {
      return join(HTML_DIR, GENERATED_SITE_VERSIONS_DIR);
    },

    /** html/preview/fonts/ */
    previewFontsDir(): string {
      return join(HTML_DIR, PREVIEW_DIR, FONTS_DIR);
    },

    /** html/preview/x-tagpages/ */
    previewTagpagesDir(): string {
      return join(HTML_DIR, PREVIEW_DIR, TAGPAGES_DIR);
    },

    /** raw/ */
    rawDir(): string {
      return RAW_DIR;
    },

    /** raw/tracked_page_content/ */
    trackedPageContentDir(): string {
      return join(RAW_DIR, TRACKED_PAGE_CONTENT_DIR);
    },

    /** raw/modified_page_content/ */
    modifiedPageContentDir(): string {
      return join(RAW_DIR, MODIFIED_PAGE_CONTENT_DIR);
    },

    /** build/markdown_export/ */
    markdownExportDir(): string {
      return join(BUILD_DIR, MARKDOWN_EXPORT_DIR);
    },

    /** raw/tracked_page_content/{subdir}/ */
    trackedPageContentSubdir(subdir: string): string {
      return join(RAW_DIR, TRACKED_PAGE_CONTENT_DIR, subdir);
    },

    /** raw/tracked_page_content/x-tagpages/ */
    trackedPageContentTagpagesDir(): string {
      return join(RAW_DIR, TRACKED_PAGE_CONTENT_DIR, TAGPAGES_DIR);
    },

    /** hooks/ */
    siteHooksDir(): string {
      return HOOKS_DIR;
    },

    /** custom_assets/ */
    customAssetsDir(): string {
      return CUSTOM_ASSETS_DIR;
    },

    /** conf/site_config.yaml */
    siteConfigFile(): string {
      return join(CONF_DIR, SITE_CONFIG_FILE);
    },

    /** conf/site_page_config.yaml */
    sitePageConfigFile(): string {
      return join(CONF_DIR, SITE_PAGE_CONFIG_FILE);
    },

    /** conf/custom_filters.json */
    customFiltersFile(): string {
      return join(CONF_DIR, CUSTOM_FILTERS_FILE);
    },

    /** hooks/{hookType}.ts */
    siteHookFile(hookType: 'pageTitleNormalization' | 'markdownProcessing' | 'htmlPostProcessing'): string {
      if (hookType === 'pageTitleNormalization') return join(HOOKS_DIR, PAGE_TITLE_NORMALIZATION_HOOK_FILE);
      if (hookType === 'markdownProcessing') return join(HOOKS_DIR, MARKDOWN_PROCESSING_HOOK_FILE);
      return join(HOOKS_DIR, HTML_POST_PROCESSING_HOOK_FILE);
    },
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute config directory paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the conf directory: SITE_DIR/conf/
   */
  getConfDir(siteDir: string): string {
    return join(siteDir, this.relative.confDir());
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute HTML output directory paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the html directory: SITE_DIR/html/
   */
  getHtmlDir(siteDir: string): string {
    return join(siteDir, this.relative.htmlDir());
  },

  /**
   * Get the preview directory: SITE_DIR/html/preview/
   */
  getPreviewDir(siteDir: string): string {
    return join(siteDir, this.relative.previewDir());
  },

  /**
   * Get the published directory: SITE_DIR/html/generated_site_versions/
   */
  getGeneratedSiteVersionsDir(siteDir: string): string {
    return join(siteDir, this.relative.generatedSiteVersionsDir());
  },

  /**
   * Get the fonts directory within preview: SITE_DIR/html/preview/fonts/
   */
  getPreviewFontsDir(siteDir: string): string {
    return join(siteDir, this.relative.previewFontsDir());
  },

  /**
   * Get the tagpages directory within preview: SITE_DIR/html/preview/x-tagpages/
   */
  getPreviewTagpagesDir(siteDir: string): string {
    return join(siteDir, this.relative.previewTagpagesDir());
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute raw content directory paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the raw directory: SITE_DIR/raw/
   */
  getRawDir(siteDir: string): string {
    return join(siteDir, this.relative.rawDir());
  },

  /**
   * Get the tracked page content directory: SITE_DIR/raw/tracked_page_content/
   */
  getTrackedPageContentDir(siteDir: string): string {
    return join(siteDir, this.relative.trackedPageContentDir());
  },

  /**
   * Get the modified page content directory: SITE_DIR/raw/modified_page_content/
   */
  getModifiedPageContentDir(siteDir: string): string {
    return join(siteDir, this.relative.modifiedPageContentDir());
  },

  /**
   * Get the markdown export directory: SITE_DIR/build/markdown_export/
   */
  getMarkdownExportDir(siteDir: string): string {
    return join(siteDir, this.relative.markdownExportDir());
  },

  /**
   * Get a subdirectory within tracked page content: SITE_DIR/raw/tracked_page_content/{subdir}/
   */
  getTrackedPageContentSubdir(siteDir: string, subdir: string): string {
    return join(siteDir, this.relative.trackedPageContentSubdir(subdir));
  },

  /**
   * Get the tagpages directory within tracked page content: SITE_DIR/raw/tracked_page_content/x-tagpages/
   */
  getTrackedPageContentTagpagesDir(siteDir: string): string {
    return join(siteDir, this.relative.trackedPageContentTagpagesDir());
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute site hooks directory paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the site-level hooks directory: SITE_DIR/hooks/
   */
  getSiteHooksDir(siteDir: string): string {
    return join(siteDir, this.relative.siteHooksDir());
  },

  /**
   * Get the site custom assets directory: SITE_DIR/custom_assets/
   */
  getSiteCustomAssetsDir(siteDir: string): string {
    return join(siteDir, this.relative.customAssetsDir());
  },

  /**
   * Get a specific file in the site custom assets directory
   */
  getSiteCustomAssetFile(siteDir: string, filename: string): string {
    return join(siteDir, this.relative.customAssetsDir(), filename);
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute config file paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the site config file path: SITE_DIR/conf/site_config.yaml
   */
  getSiteConfigFile(siteDir: string): string {
    return join(siteDir, this.relative.siteConfigFile());
  },

  /**
   * Get the site page config file path: SITE_DIR/conf/site_page_config.yaml
   */
  getSitePageConfigFile(siteDir: string): string {
    return join(siteDir, this.relative.sitePageConfigFile());
  },

  /**
   * Get the custom filters file path: SITE_DIR/conf/custom_filters.json
   */
  getCustomFiltersFile(siteDir: string): string {
    return join(siteDir, this.relative.customFiltersFile());
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute site hook file paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get a site hook file path by hook type
   */
  getSiteHookFile(siteDir: string, hookType: 'pageTitleNormalization' | 'markdownProcessing' | 'htmlPostProcessing'): string {
    return join(siteDir, this.relative.siteHookFile(hookType));
  },

  // ─────────────────────────────────────────────────────────────────
  // Constants for when you need just the directory/file names
  // ─────────────────────────────────────────────────────────────────

  /** The build subdirectory name: 'build' */
  BUILD_DIR,

  /** The conf subdirectory name: 'conf' */
  CONF_DIR,

  /** The html subdirectory name: 'html' */
  HTML_DIR,

  /** The raw subdirectory name: 'raw' */
  RAW_DIR,

  /** The hooks subdirectory name: 'hooks' */
  HOOKS_DIR,

  /** The custom_assets subdirectory name: 'custom_assets' */
  CUSTOM_ASSETS_DIR,

  /** The preview subdirectory name: 'preview' */
  PREVIEW_DIR,

  /** The published subdirectory name: 'published' */
  GENERATED_SITE_VERSIONS_DIR,

  /** The tracked_page_content subdirectory name: 'tracked_page_content' */
  TRACKED_PAGE_CONTENT_DIR,

  /** The tagpages subdirectory name: 'x-tagpages' */
  TAGPAGES_DIR,

  /** The markdown_export subdirectory name: 'markdown_export' */
  MARKDOWN_EXPORT_DIR,

  /** Config file names */
  CONFIG_FILES: {
    site_config: SITE_CONFIG_FILE,
    site_page_config: SITE_PAGE_CONFIG_FILE,
    custom_filters: CUSTOM_FILTERS_FILE,
  } as const,

  /** Hook file names */
  HOOK_FILES: {
    pageTitleNormalization: PAGE_TITLE_NORMALIZATION_HOOK_FILE,
    markdownProcessing: MARKDOWN_PROCESSING_HOOK_FILE,
    htmlPostProcessing: HTML_POST_PROCESSING_HOOK_FILE,
  } as const,
};
