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

import * as fs from 'fs';
import { getConfigDirectory, getBundleDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { parseHTML } from 'linkedom';
import { PageTitleNormalizationHook, MarkdownProcessingHook, HtmlPostProcessingHook, HookType, HookScope, HookMetadata, HookLoadStatus } from '../../../../../../../contracts/types/hooks.js';
import { AppConfigPaths } from '../../../../../../../shared_code/paths/appConfigPaths.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { loadBundleConfig } from '../../../../shared/utils/bundleConfigUtils.js';
import { logBundleWarn } from '../../../../shared/utils/logging/bundleLogger.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

interface HookCacheEntry {
  hook: PageTitleNormalizationHook | MarkdownProcessingHook | HtmlPostProcessingHook | null;
  error?: string;
}

export class HooksLoader {
  // Cache structure: Map<scope:bundleSlug:hookType, HookCacheEntry>
  private static hooksCache = new Map<string, HookCacheEntry>();
  
  /**
   * Get the global hooks directory path
   */
  private static getGlobalHooksDirectory(): string {
    return AppConfigPaths.getGlobalHooksDir(getConfigDirectory());
  }
  
  /**
   * Get the bundle-specific hooks directory path
   */
  private static getBundleHooksDirectory(bundleSlug: string): string {
    return BundleConfigPaths.getBundleHooksDir(getBundleDirectory(bundleSlug));
  }
  
  /**
   * Get the hook file path for a specific scope and type
   */
  private static getHookFilePath(scope: HookScope, hookType: HookType, bundleSlug?: string): string {
    if (scope === 'global') {
      return AppConfigPaths.getGlobalHookFile(getConfigDirectory(), hookType);
    }
    return BundleConfigPaths.getBundleHookFile(getBundleDirectory(bundleSlug!), hookType);
  }
  
  /**
   * Check if a hook is disabled for a specific bundle
   */
  private static isHookDisabledForBundle(bundleSlug: string, hookType: HookType): boolean {
    try {
      const bundleDirectory = getBundleDirectory(bundleSlug);
      const bundleConfig = loadBundleConfig(bundleDirectory);
      const disabledGlobalHooks = bundleConfig.disabledGlobalHooks || [];
      return disabledGlobalHooks.includes(hookType);
    } catch (error) {
      logBundleWarn(bundleSlug, `[HooksLoader] Error checking disabled hooks: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Check if a hook is in append mode for a specific bundle
   * Append mode: run global first, then bundle on global's result
   */
  private static isHookInAppendMode(bundleSlug: string, hookType: HookType): boolean {
    try {
      const bundleDirectory = getBundleDirectory(bundleSlug);
      const bundleConfig = loadBundleConfig(bundleDirectory);
      const hookAppendMode = bundleConfig.hookAppendMode || {};
      return !!hookAppendMode[hookType];
    } catch (error) {
      logBundleWarn(bundleSlug, `[HooksLoader] Error checking hook append mode: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Get the cache key for a hook
   */
  private static getCacheKey(scope: HookScope, hookType: HookType, bundleSlug?: string): string {
    return `${scope}:${bundleSlug || 'global'}:${hookType}`;
  }
  
  /**
   * Try to execute page title normalization hook with bundle/global precedence
   */
  public static tryExecutePageTitleNormalization(bundleSlug: string, pageTitle: string): string {
    const hookType: HookType = 'pageTitleNormalization';

    // First, try to get bundle-level hook
    const bundleHook = this.loadHook('bundle', hookType, bundleSlug) as PageTitleNormalizationHook | null;
    if (bundleHook) {
      // Check if append mode: run global first, then bundle on global's result
      if (this.isHookInAppendMode(bundleSlug, hookType)) {
        let result = pageTitle;
        const globalHook = this.loadHook('global', hookType) as PageTitleNormalizationHook | null;
        if (globalHook) {
          try {
            result = globalHook.pageTitleNormalization(bundleSlug, result);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logBundleWarn(bundleSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
          }
        }
        try {
          return bundleHook.pageTitleNormalization(bundleSlug, result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logBundleWarn(bundleSlug, `[HooksLoader] Bundle hook execution failed: ${errorMessage}`);
          return result;
        }
      }
      // Override mode: bundle only
      try {
        return bundleHook.pageTitleNormalization(bundleSlug, pageTitle);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logBundleWarn(bundleSlug, `[HooksLoader] Bundle hook execution failed: ${errorMessage}`);
        return pageTitle;
      }
    }

    // Check if global hook is disabled for this bundle
    if (this.isHookDisabledForBundle(bundleSlug, hookType)) {
      return pageTitle;
    }

    // Fall back to global hook
    const globalHook = this.loadHook('global', hookType) as PageTitleNormalizationHook | null;
    if (globalHook) {
      try {
        return globalHook.pageTitleNormalization(bundleSlug, pageTitle);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logBundleWarn(bundleSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
        return pageTitle;
      }
    }

    return pageTitle;
  }
  
  /**
   * Try to execute markdown processing page hook with bundle/global precedence
   */
  public static tryExecuteMarkdownProcessingPage(bundleSlug: string, mdContent: string): string {
    const hookType: HookType = 'markdownProcessing';

    // First, try to get bundle-level hook
    const bundleHook = this.loadHook('bundle', hookType, bundleSlug) as MarkdownProcessingHook | null;
    if (bundleHook) {
      if (this.isHookInAppendMode(bundleSlug, hookType)) {
        let result = mdContent;
        const globalHook = this.loadHook('global', hookType) as MarkdownProcessingHook | null;
        if (globalHook) {
          try {
            result = globalHook.markdownProcessingPage(bundleSlug, result);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logBundleWarn(bundleSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
          }
        }
        try {
          return bundleHook.markdownProcessingPage(bundleSlug, result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logBundleWarn(bundleSlug, `[HooksLoader] Bundle hook execution failed: ${errorMessage}`);
          return result;
        }
      }
      try {
        return bundleHook.markdownProcessingPage(bundleSlug, mdContent);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logBundleWarn(bundleSlug, `[HooksLoader] Bundle hook execution failed: ${errorMessage}`);
        return mdContent;
      }
    }

    // Check if global hook is disabled for this bundle
    if (this.isHookDisabledForBundle(bundleSlug, hookType)) {
      return mdContent;
    }

    // Fall back to global hook
    const globalHook = this.loadHook('global', hookType) as MarkdownProcessingHook | null;
    if (globalHook) {
      try {
        return globalHook.markdownProcessingPage(bundleSlug, mdContent);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logBundleWarn(bundleSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
        return mdContent;
      }
    }

    return mdContent;
  }

  /**
   * Try to execute markdown processing backlinks hook with bundle/global precedence
   */
  public static tryExecuteMarkdownProcessingBacklinks(bundleSlug: string, mdContent: string): string {
    const hookType: HookType = 'markdownProcessing';

    // First, try to get bundle-level hook
    const bundleHook = this.loadHook('bundle', hookType, bundleSlug) as MarkdownProcessingHook | null;
    if (bundleHook) {
      if (this.isHookInAppendMode(bundleSlug, hookType)) {
        let result = mdContent;
        const globalHook = this.loadHook('global', hookType) as MarkdownProcessingHook | null;
        if (globalHook) {
          try {
            result = globalHook.markdownProcessingBacklinks(bundleSlug, result);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logBundleWarn(bundleSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
          }
        }
        try {
          return bundleHook.markdownProcessingBacklinks(bundleSlug, result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logBundleWarn(bundleSlug, `[HooksLoader] Bundle hook execution failed: ${errorMessage}`);
          return result;
        }
      }
      try {
        return bundleHook.markdownProcessingBacklinks(bundleSlug, mdContent);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logBundleWarn(bundleSlug, `[HooksLoader] Bundle hook execution failed: ${errorMessage}`);
        return mdContent;
      }
    }

    // Check if global hook is disabled for this bundle
    if (this.isHookDisabledForBundle(bundleSlug, hookType)) {
      return mdContent;
    }

    // Fall back to global hook
    const globalHook = this.loadHook('global', hookType) as MarkdownProcessingHook | null;
    if (globalHook) {
      try {
        return globalHook.markdownProcessingBacklinks(bundleSlug, mdContent);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logBundleWarn(bundleSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
        return mdContent;
      }
    }

    return mdContent;
  }
  
  /**
   * Try to execute HTML post-processing hook with bundle/global precedence
   */
  public static tryExecuteHtmlPostProcessing(bundleSlug: string, htmlContent: string, pageName: string): string {
    const hookType: HookType = 'htmlPostProcessing';

    // First, try to get bundle-level hook
    const bundleHook = this.loadHook('bundle', hookType, bundleSlug) as HtmlPostProcessingHook | null;
    if (bundleHook) {
      if (this.isHookInAppendMode(bundleSlug, hookType)) {
        // Append mode: run global first, then bundle on global's result
        let result = htmlContent;
        const globalHook = this.loadHook('global', hookType) as HtmlPostProcessingHook | null;
        if (globalHook) {
          try {
            const { document } = parseHTML(result);
            globalHook.htmlPostProcessing(bundleSlug, document, pageName);
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            result = document.toString();
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logBundleWarn(bundleSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
          }
        }
        try {
          const { document } = parseHTML(result);
          bundleHook.htmlPostProcessing(bundleSlug, document, pageName);
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          return document.toString();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logBundleWarn(bundleSlug, `[HooksLoader] Bundle hook execution failed: ${errorMessage}`);
          return result;
        }
      }
      // Override mode: bundle only
      try {
        const { document } = parseHTML(htmlContent);
        bundleHook.htmlPostProcessing(bundleSlug, document, pageName);
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return document.toString();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logBundleWarn(bundleSlug, `[HooksLoader] Bundle hook execution failed: ${errorMessage}`);
        return htmlContent;
      }
    }

    // Check if global hook is disabled for this bundle
    if (this.isHookDisabledForBundle(bundleSlug, hookType)) {
      return htmlContent;
    }

    // Fall back to global hook
    const globalHook = this.loadHook('global', hookType) as HtmlPostProcessingHook | null;
    if (globalHook) {
      try {
        const { document } = parseHTML(htmlContent);
        globalHook.htmlPostProcessing(bundleSlug, document, pageName);
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return document.toString();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logBundleWarn(bundleSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
        return htmlContent;
      }
    }

    return htmlContent;
  }

  /**
   * Load a hook (with caching)
   */
  public static loadHook(
    scope: HookScope,
    hookType: HookType,
    bundleSlug?: string
  ): PageTitleNormalizationHook | MarkdownProcessingHook | HtmlPostProcessingHook | null {
    const cacheKey = this.getCacheKey(scope, hookType, bundleSlug);
    
    // Check cache first
    if (this.hooksCache.has(cacheKey)) {
      const cached = this.hooksCache.get(cacheKey)!;
      return cached.hook;
    }
    
    // Load the hook
    const hookPath = this.getHookFilePath(scope, hookType, bundleSlug);
    const entry = this.loadHookFromFile(hookPath, hookType);
    this.hooksCache.set(cacheKey, entry);
    
    return entry.hook;
  }
  
  /**
   * Get hook metadata (for API endpoints)
   */
  public static getHookMetadata(scope: HookScope, hookType: HookType, bundleSlug?: string): HookMetadata {
    const hookPath = this.getHookFilePath(scope, hookType, bundleSlug);
    const exists = fs.existsSync(hookPath);

    if (!exists) {
      return {
        hookType,
        scope,
        exists: false,
        filePath: hookPath
      };
    }

    try {
      const content = fs.readFileSync(hookPath, 'utf-8');
      const cacheKey = this.getCacheKey(scope, hookType, bundleSlug);
      const cached = this.hooksCache.get(cacheKey);

      return {
        hookType,
        scope,
        exists: true,
        content,
        error: cached?.error,
        filePath: hookPath
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        hookType,
        scope,
        exists: true,
        error: `Failed to read hook file: ${errorMessage}`,
        filePath: hookPath
      };
    }
  }
  
  /**
   * Get load status for all hooks (for error indicator)
   */
  public static getLoadStatus(bundleSlug?: string): HookLoadStatus {
    const errors: HookLoadStatus['errors'] = [];
    const hookTypes: HookType[] = ['pageTitleNormalization', 'markdownProcessing', 'htmlPostProcessing'];
    
    for (const hookType of hookTypes) {
      // Check global hooks
      const globalCacheKey = this.getCacheKey('global', hookType);
      const globalCached = this.hooksCache.get(globalCacheKey);
      if (globalCached?.error) {
        errors.push({
          hookType,
          scope: 'global',
          error: globalCached.error
        });
      }
      
      // Check bundle hooks if bundleSlug provided
      if (bundleSlug) {
        const bundleCacheKey = this.getCacheKey('bundle', hookType, bundleSlug);
        const bundleCached = this.hooksCache.get(bundleCacheKey);
        if (bundleCached?.error) {
          errors.push({
            hookType,
            scope: 'bundle',
            error: bundleCached.error
          });
        }
      }
    }
    
    return {
      allLoaded: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate hook code by attempting to load it
   */
  public static validateHookCode(hookType: HookType, code: string): { success: boolean; error?: string } {
    try {
      const hook = this.parseHookCode(code, hookType);
      if (!hook) {
        return { success: false, error: 'Failed to parse hook code' };
      }
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }
  
  /**
   * Load hook from file
   */
  private static loadHookFromFile(hookPath: string, hookType: HookType): HookCacheEntry {
    // Check if hook file exists
    if (!fs.existsSync(hookPath)) {
      return { hook: null };
    }
    
    try {
      const content = fs.readFileSync(hookPath, 'utf-8');
      const hook = this.parseHookCode(content, hookType);
      return { hook };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[HooksLoader] Error loading hook from ${hookPath}: ${errorMessage}`);
      return { hook: null, error: errorMessage };
    }
  }
  
  /**
   * Parse hook code and return the hook object
   * Public for use in validation endpoints
   */
  public static parseHookCode(
    content: string,
    hookType: HookType
  ): PageTitleNormalizationHook | MarkdownProcessingHook | HtmlPostProcessingHook | null {
    // Simple TypeScript to JavaScript conversion
    // Remove type annotations more carefully
    content = content.replace(/:\s*string\[\]/g, '');
    content = content.replace(/:\s*number\[\]/g, '');
    content = content.replace(/:\s*boolean\[\]/g, '');
    content = content.replace(/:\s*string(?=\s*[,;=)\]\s])/g, '');
    content = content.replace(/:\s*number(?=\s*[,;=)\]\s])/g, '');
    content = content.replace(/:\s*boolean(?=\s*[,;=)\]\s])/g, '');
    content = content.replace(/\)\s*:\s*string\s*\{/g, ') {');
    content = content.replace(/\)\s*:\s*number\s*\{/g, ') {');
    content = content.replace(/\)\s*:\s*boolean\s*\{/g, ') {');
    content = content.replace(/\)\s*:\s*void\s*\{/g, ') {');
    content = content.replace(/:\s*Record<[^>]+>/g, '');
    content = content.replace(/:\s*\{[^}]*\}/g, '');
    content = content.replace(/:\s*[A-Z][a-zA-Z0-9<>[\], ]*(?=\s*[,;=)\]\s])/g, '');
    
    interface ModuleScope {
      exports: Record<string, unknown>;
      module: { exports: Record<string, unknown> };
    }
    
    const moduleScope: ModuleScope = {
      exports: {},
      module: { exports: {} }
    };
    
    if (hookType === 'pageTitleNormalization') {
      const wrappedContent = `
        ${content}

        if (typeof pageTitleNormalization === 'function') {
          this.pageTitleNormalization = pageTitleNormalization;
        }
      `;

      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(wrappedContent).call(moduleScope.module.exports);

      const hookModule = moduleScope.module.exports;
      const hookFunction = hookModule.pageTitleNormalization;
      if (typeof hookFunction === 'function') {
        return {
          pageTitleNormalization: hookFunction as (bundleSlug: string, pageTitle: string) => string
        };
      }
    } else if (hookType === 'markdownProcessing') {
      const wrappedContent = `
        ${content}

        if (typeof markdownProcessingPage === 'function') {
          this.markdownProcessingPage = markdownProcessingPage;
        }
        if (typeof markdownProcessingBacklinks === 'function') {
          this.markdownProcessingBacklinks = markdownProcessingBacklinks;
        }
      `;

      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(wrappedContent).call(moduleScope.module.exports);

      const hookModule = moduleScope.module.exports;
      const pageFunction = hookModule.markdownProcessingPage;
      const backlinksFunction = hookModule.markdownProcessingBacklinks;

      if (typeof pageFunction === 'function' && typeof backlinksFunction === 'function') {
        return {
          markdownProcessingPage: pageFunction as (bundleSlug: string, mdContent: string) => string,
          markdownProcessingBacklinks: backlinksFunction as (bundleSlug: string, mdContent: string) => string
        };
      }
    } else if (hookType === 'htmlPostProcessing') {
      const wrappedContent = `
        ${content}

        if (typeof htmlPostProcessing === 'function') {
          this.htmlPostProcessing = htmlPostProcessing;
        }
      `;

      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(wrappedContent).call(moduleScope.module.exports);

      const hookModule = moduleScope.module.exports;
      const hookFunction = hookModule.htmlPostProcessing;
      if (typeof hookFunction === 'function') {
        return {
          htmlPostProcessing: hookFunction as (bundleSlug: string, document: unknown, pageName: string) => void
        };
      }
    }

    return null;
  }

  /**
   * Clear hooks cache (useful for development/testing)
   */
  public static clearCache(scope?: HookScope, hookType?: HookType, bundleSlug?: string): void {
    if (scope && hookType) {
      const cacheKey = this.getCacheKey(scope, hookType, bundleSlug);
      this.hooksCache.delete(cacheKey);
    } else {
      this.hooksCache.clear();
    }
  }
}
