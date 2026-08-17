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
 * Centralized path definitions for bundle-level configuration.
 *
 * All paths are relative to a bundle directory (BUNDLE_DIR).
 * This file defines the structure of:
 *   BUNDLE_DIR/
 *     build/
 *       prepared_source_content/
 *       prepared_bundle_node_config.yaml
 *       render_source_content/
 *       okf/
 *       sources_export/
 *       scrubbed_source_content/
 *     config/
 *       bundle_config.yaml
 *       bundle_node_config.yaml
 *       custom_filters.json
 *     html/
 *       generated_bundle_versions/
 *     raw/
 *       tracked_page_content/
 *       tracked_bundle_node_config.yaml
 *     hooks/
 *       pageTitleNormalization.ts
 *       markdownProcessing.ts
 *
 * Usage:
 *   import { BundleConfigPaths } from 'shared_code/paths/bundleConfigPaths.js';
 *   // Relative paths (relative to bundle directory)
 *   const relPath = BundleConfigPaths.relative.bundleConfigFile(); // 'config/bundle_config.yaml'
 *   // Absolute paths
 *   const absPath = BundleConfigPaths.getBundleConfigFile(bundleDir);
 */

import { join } from 'path';

// Directory names (single source of truth)
const BUILD_DIR = 'build';
const CONFIG_DIR = 'config';
const HTML_DIR = 'html';
const RAW_DIR = 'raw';
const HOOKS_DIR = 'hooks';
const CUSTOM_ASSETS_DIR = 'custom_assets';
const OPEN_KNOWLEDGE_FORMAT_DIR = 'okf';
const SOURCES_EXPORT_DIR = 'sources_export';
const GENERATED_BUNDLE_VERSIONS_DIR = 'generated_bundle_versions';
const TRACKED_PAGE_CONTENT_DIR = 'tracked_page_content';
const PREPARED_SOURCE_CONTENT_DIR = 'prepared_source_content';
const RENDER_SOURCE_CONTENT_DIR = 'render_source_content';
const LEGACY_RENDER_SOURCE_CONTENT_DIR = 'modified_page_content';
const SCRUBBED_SOURCE_CONTENT_DIR = 'scrubbed_source_content';
const TAGPAGE_SOURCE_STAGING_DIR = 'x-tagpages';
const GENERATED_BUNDLE_INTERNAL_DIR = '_mw_gen';
const GENERATED_TAGPAGES_DIR = 'tagpages';
const GENERATED_FOLDERPAGES_DIR = 'folderpages';
const GENERATED_SOURCEPAGES_DIR = 'sourcepages';

// File names
const BUNDLE_CONFIG_FILE = 'bundle_config.yaml';
const BUNDLE_NODE_CONFIG_FILE = 'bundle_node_config.yaml';
const TRACKED_BUNDLE_NODE_CONFIG_FILE = 'tracked_bundle_node_config.yaml';
const PREPARED_BUNDLE_NODE_CONFIG_FILE = 'prepared_bundle_node_config.yaml';
const CUSTOM_FILTERS_FILE = 'custom_filters.json';
const PAGE_TITLE_NORMALIZATION_HOOK_FILE = 'pageTitleNormalization.ts';
const MARKDOWN_PROCESSING_HOOK_FILE = 'markdownProcessing.ts';
const HTML_POST_PROCESSING_HOOK_FILE = 'htmlPostProcessing.ts';

export const BundleConfigPaths = {
  // ─────────────────────────────────────────────────────────────────
  // Relative paths (relative to bundle directory)
  // These are the base paths; absolute paths are built from these.
  // ─────────────────────────────────────────────────────────────────
  relative: {
    /** config/ */
    configDir(): string {
      return CONFIG_DIR;
    },

    /** html/ */
    htmlDir(): string {
      return HTML_DIR;
    },

    /** html/generated_bundle_versions/ */
    generatedBundleVersionsDir(): string {
      return join(HTML_DIR, GENERATED_BUNDLE_VERSIONS_DIR);
    },

    /** raw/ */
    rawDir(): string {
      return RAW_DIR;
    },

    /** raw/tracked_page_content/ */
    trackedPageContentDir(): string {
      return join(RAW_DIR, TRACKED_PAGE_CONTENT_DIR);
    },

    /** raw/tracked_bundle_node_config.yaml */
    trackedBundleNodeConfigFile(): string {
      return join(RAW_DIR, TRACKED_BUNDLE_NODE_CONFIG_FILE);
    },

    /** build/prepared_source_content/ */
    preparedSourceContentDir(): string {
      return join(BUILD_DIR, PREPARED_SOURCE_CONTENT_DIR);
    },

    /** build/prepared_bundle_node_config.yaml */
    preparedBundleNodeConfigFile(): string {
      return join(BUILD_DIR, PREPARED_BUNDLE_NODE_CONFIG_FILE);
    },

    /** build/render_source_content/ */
    renderSourceContentDir(): string {
      return join(BUILD_DIR, RENDER_SOURCE_CONTENT_DIR);
    },

    /** build/okf/ */
    openKnowledgeFormatDir(): string {
      return join(BUILD_DIR, OPEN_KNOWLEDGE_FORMAT_DIR);
    },

    /** build/scrubbed_source_content/ */
    scrubbedSourceContentDir(): string {
      return join(BUILD_DIR, SCRUBBED_SOURCE_CONTENT_DIR);
    },

    /** build/sources_export/ */
    sourcesExportDir(): string {
      return join(BUILD_DIR, SOURCES_EXPORT_DIR);
    },

    /** raw/tracked_page_content/{subdir}/ */
    trackedPageContentSubdir(subdir: string): string {
      return join(RAW_DIR, TRACKED_PAGE_CONTENT_DIR, subdir);
    },

    /** raw/tracked_page_content/x-tagpages/ */
    trackedPageContentTagpagesDir(): string {
      return join(RAW_DIR, TRACKED_PAGE_CONTENT_DIR, TAGPAGE_SOURCE_STAGING_DIR);
    },

    /** hooks/ */
    bundleHooksDir(): string {
      return HOOKS_DIR;
    },

    /** custom_assets/ */
    customAssetsDir(): string {
      return CUSTOM_ASSETS_DIR;
    },

    /** config/bundle_config.yaml */
    bundleConfigFile(): string {
      return join(CONFIG_DIR, BUNDLE_CONFIG_FILE);
    },

    /** config/bundle_node_config.yaml */
    bundleNodeConfigFile(): string {
      return join(CONFIG_DIR, BUNDLE_NODE_CONFIG_FILE);
    },

    /** config/custom_filters.json */
    customFiltersFile(): string {
      return join(CONFIG_DIR, CUSTOM_FILTERS_FILE);
    },

    /** hooks/{hookType}.ts */
    bundleHookFile(hookType: 'pageTitleNormalization' | 'markdownProcessing' | 'htmlPostProcessing'): string {
      if (hookType === 'pageTitleNormalization') return join(HOOKS_DIR, PAGE_TITLE_NORMALIZATION_HOOK_FILE);
      if (hookType === 'markdownProcessing') return join(HOOKS_DIR, MARKDOWN_PROCESSING_HOOK_FILE);
      return join(HOOKS_DIR, HTML_POST_PROCESSING_HOOK_FILE);
    },
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute config directory paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the config directory: BUNDLE_DIR/config/
   */
  getConfigDir(bundleDir: string): string {
    return join(bundleDir, this.relative.configDir());
  },

  /**
   * Get the build directory: BUNDLE_DIR/build/
   */
  getBuildDir(bundleDir: string): string {
    return join(bundleDir, BUILD_DIR);
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute HTML output directory paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the html directory: BUNDLE_DIR/html/
   */
  getHtmlDir(bundleDir: string): string {
    return join(bundleDir, this.relative.htmlDir());
  },

  /**
   * Get the published directory: BUNDLE_DIR/html/generated_bundle_versions/
   */
  getGeneratedBundleVersionsDir(bundleDir: string): string {
    return join(bundleDir, this.relative.generatedBundleVersionsDir());
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute raw content directory paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the raw directory: BUNDLE_DIR/raw/
   */
  getRawDir(bundleDir: string): string {
    return join(bundleDir, this.relative.rawDir());
  },

  /**
   * Get the tracked page content directory: BUNDLE_DIR/raw/tracked_page_content/
   */
  getTrackedPageContentDir(bundleDir: string): string {
    return join(bundleDir, this.relative.trackedPageContentDir());
  },

  /**
   * Get the generation-only tracked bundle node config:
   * BUNDLE_DIR/raw/tracked_bundle_node_config.yaml
   */
  getTrackedBundleNodeConfigFile(bundleDir: string): string {
    return join(bundleDir, this.relative.trackedBundleNodeConfigFile());
  },

  /**
   * Get the prepared source content directory: BUNDLE_DIR/build/prepared_source_content/
   */
  getPreparedSourceContentDir(bundleDir: string): string {
    return join(bundleDir, this.relative.preparedSourceContentDir());
  },

  /**
   * Get the prepared bundle node config file: BUNDLE_DIR/build/prepared_bundle_node_config.yaml
   */
  getPreparedBundleNodeConfigFile(bundleDir: string): string {
    return join(bundleDir, this.relative.preparedBundleNodeConfigFile());
  },

  /**
   * Get the render source content directory: BUNDLE_DIR/build/render_source_content/
   */
  getRenderSourceContentDir(bundleDir: string): string {
    return join(bundleDir, this.relative.renderSourceContentDir());
  },

  /**
   * Get the OKF build directory: BUNDLE_DIR/build/okf/
   */
  getOpenKnowledgeFormatDir(bundleDir: string): string {
    return join(bundleDir, this.relative.openKnowledgeFormatDir());
  },

  /**
   * Get the legacy render source content directory used before the build phase was renamed.
   */
  getLegacyRenderSourceContentDir(bundleDir: string): string {
    return join(bundleDir, BUILD_DIR, LEGACY_RENDER_SOURCE_CONTENT_DIR);
  },

  /**
   * Get the scrubbed source content directory: BUNDLE_DIR/build/scrubbed_source_content/
   */
  getScrubbedSourceContentDir(bundleDir: string): string {
    return join(bundleDir, this.relative.scrubbedSourceContentDir());
  },

  /**
   * Get the sources export directory: BUNDLE_DIR/build/sources_export/
   */
  getSourcesExportDir(bundleDir: string): string {
    return join(bundleDir, this.relative.sourcesExportDir());
  },

  /**
   * Get a subdirectory within tracked page content: BUNDLE_DIR/raw/tracked_page_content/{subdir}/
   */
  getTrackedPageContentSubdir(bundleDir: string, subdir: string): string {
    return join(bundleDir, this.relative.trackedPageContentSubdir(subdir));
  },

  /**
   * Get the tagpages directory within tracked page content: BUNDLE_DIR/raw/tracked_page_content/x-tagpages/
   */
  getTrackedPageContentTagpagesDir(bundleDir: string): string {
    return join(bundleDir, this.relative.trackedPageContentTagpagesDir());
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute bundle hooks directory paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the bundle-level hooks directory: BUNDLE_DIR/hooks/
   */
  getBundleHooksDir(bundleDir: string): string {
    return join(bundleDir, this.relative.bundleHooksDir());
  },

  /**
   * Get the bundle custom assets directory: BUNDLE_DIR/custom_assets/
   */
  getBundleCustomAssetsDir(bundleDir: string): string {
    return join(bundleDir, this.relative.customAssetsDir());
  },

  /**
   * Get a specific file in the bundle custom assets directory
   */
  getBundleCustomAssetFile(bundleDir: string, filename: string): string {
    return join(bundleDir, this.relative.customAssetsDir(), filename);
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute config file paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the bundle config file path: BUNDLE_DIR/config/bundle_config.yaml
   */
  getBundleConfigFile(bundleDir: string): string {
    return join(bundleDir, this.relative.bundleConfigFile());
  },

  /**
   * Get the bundle node config file path: BUNDLE_DIR/config/bundle_node_config.yaml
   */
  getBundleNodeConfigFile(bundleDir: string): string {
    return join(bundleDir, this.relative.bundleNodeConfigFile());
  },

  /**
   * Get the custom filters file path: BUNDLE_DIR/config/custom_filters.json
   */
  getCustomFiltersFile(bundleDir: string): string {
    return join(bundleDir, this.relative.customFiltersFile());
  },

  // ─────────────────────────────────────────────────────────────────
  // Absolute bundle hook file paths (built from relative paths)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get a bundle hook file path by hook type
   */
  getBundleHookFile(bundleDir: string, hookType: 'pageTitleNormalization' | 'markdownProcessing' | 'htmlPostProcessing'): string {
    return join(bundleDir, this.relative.bundleHookFile(hookType));
  },

  // ─────────────────────────────────────────────────────────────────
  // Constants for when you need just the directory/file names
  // ─────────────────────────────────────────────────────────────────

  /** The build subdirectory name: 'build' */
  BUILD_DIR,

  /** The config subdirectory name: 'config' */
  CONFIG_DIR,

  /** The html subdirectory name: 'html' */
  HTML_DIR,

  /** The raw subdirectory name: 'raw' */
  RAW_DIR,

  /** The hooks subdirectory name: 'hooks' */
  HOOKS_DIR,

  /** The custom_assets subdirectory name: 'custom_assets' */
  CUSTOM_ASSETS_DIR,

  /** The generated-bundle version directories subdirectory name. */
  GENERATED_BUNDLE_VERSIONS_DIR,

  /** The tracked_page_content subdirectory name: 'tracked_page_content' */
  TRACKED_PAGE_CONTENT_DIR,

  /** The prepared_source_content subdirectory name: 'prepared_source_content' */
  PREPARED_SOURCE_CONTENT_DIR,

  /** The render_source_content subdirectory name: 'render_source_content' */
  RENDER_SOURCE_CONTENT_DIR,

  /** The OKF build subdirectory name: 'okf' */
  OPEN_KNOWLEDGE_FORMAT_DIR,

  /** The scrubbed_source_content subdirectory name: 'scrubbed_source_content' */
  SCRUBBED_SOURCE_CONTENT_DIR,

  /** Generation-only source staging directory for synthetic tag Markdown. */
  TAGPAGE_SOURCE_STAGING_DIR,

  /** Reserved root for generated public pages inside a generated bundle. */
  GENERATED_BUNDLE_INTERNAL_DIR,

  /** Generated tag-page directory below GENERATED_BUNDLE_INTERNAL_DIR. */
  GENERATED_TAGPAGES_DIR,

  /** Generated folder-page directory below GENERATED_BUNDLE_INTERNAL_DIR. */
  GENERATED_FOLDERPAGES_DIR,

  /** Relocated source-page directory below GENERATED_BUNDLE_INTERNAL_DIR. */
  GENERATED_SOURCEPAGES_DIR,

  /** The sources_export subdirectory name: 'sources_export' */
  SOURCES_EXPORT_DIR,

  /** Config file names */
  CONFIG_FILES: {
    bundle_config: BUNDLE_CONFIG_FILE,
    bundle_node_config: BUNDLE_NODE_CONFIG_FILE,
    tracked_bundle_node_config: TRACKED_BUNDLE_NODE_CONFIG_FILE,
    prepared_bundle_node_config: PREPARED_BUNDLE_NODE_CONFIG_FILE,
    custom_filters: CUSTOM_FILTERS_FILE,
  } as const,

  /** Hook file names */
  HOOK_FILES: {
    pageTitleNormalization: PAGE_TITLE_NORMALIZATION_HOOK_FILE,
    markdownProcessing: MARKDOWN_PROCESSING_HOOK_FILE,
    htmlPostProcessing: HTML_POST_PROCESSING_HOOK_FILE,
  } as const,
};
