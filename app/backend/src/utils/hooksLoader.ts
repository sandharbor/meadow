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
import { getConfigDirectory, getSiteDirectory } from '../routes/siteConfigRoutes.js';
import { parseHTML } from 'linkedom';
import { PageTitleNormalizationHook, MarkdownProcessingHook, HtmlPostProcessingHook, HookType, HookScope, HookMetadata, HookLoadStatus } from '../../../shared_code/types/hooks.js';
import { AppConfigPaths } from '../../../shared_code/paths/appConfigPaths.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { loadSiteConfig } from './siteConfigUtils.js';
import { logSiteWarn } from './logging/siteLogger.js';
import { logger } from './logging/backendLoggingUtils.js';

interface HookCacheEntry {
  hook: PageTitleNormalizationHook | MarkdownProcessingHook | HtmlPostProcessingHook | null;
  error?: string;
}

export class HooksLoader {
  // Cache structure: Map<scope:siteSlug:hookType, HookCacheEntry>
  private static hooksCache = new Map<string, HookCacheEntry>();
  
  /**
   * Get the global hooks directory path
   */
  private static getGlobalHooksDirectory(): string {
    return AppConfigPaths.getGlobalHooksDir(getConfigDirectory());
  }
  
  /**
   * Get the site-specific hooks directory path
   */
  private static getSiteHooksDirectory(siteSlug: string): string {
    return SiteConfigPaths.getSiteHooksDir(getSiteDirectory(siteSlug));
  }
  
  /**
   * Get the hook file path for a specific scope and type
   */
  private static getHookFilePath(scope: HookScope, hookType: HookType, siteSlug?: string): string {
    if (scope === 'global') {
      return AppConfigPaths.getGlobalHookFile(getConfigDirectory(), hookType);
    }
    return SiteConfigPaths.getSiteHookFile(getSiteDirectory(siteSlug!), hookType);
  }
  
  /**
   * Check if a hook is disabled for a specific site
   */
  private static isHookDisabledForSite(siteSlug: string, hookType: HookType): boolean {
    try {
      const siteDirectory = getSiteDirectory(siteSlug);
      const siteConfig = loadSiteConfig(siteDirectory);
      const disabledGlobalHooks = siteConfig.disabledGlobalHooks || [];
      return disabledGlobalHooks.includes(hookType);
    } catch (error) {
      logSiteWarn(siteSlug, `[HooksLoader] Error checking disabled hooks: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Check if a hook is in append mode for a specific site
   * Append mode: run global first, then site on global's result
   */
  private static isHookInAppendMode(siteSlug: string, hookType: HookType): boolean {
    try {
      const siteDirectory = getSiteDirectory(siteSlug);
      const siteConfig = loadSiteConfig(siteDirectory);
      const hookAppendMode = siteConfig.hookAppendMode || {};
      return !!hookAppendMode[hookType];
    } catch (error) {
      logSiteWarn(siteSlug, `[HooksLoader] Error checking hook append mode: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Get the cache key for a hook
   */
  private static getCacheKey(scope: HookScope, hookType: HookType, siteSlug?: string): string {
    return `${scope}:${siteSlug || 'global'}:${hookType}`;
  }
  
  /**
   * Try to execute page title normalization hook with site/global precedence
   */
  public static tryExecutePageTitleNormalization(siteSlug: string, pageTitle: string): string {
    const hookType: HookType = 'pageTitleNormalization';

    // First, try to get site-level hook
    const siteHook = this.loadHook('site', hookType, siteSlug) as PageTitleNormalizationHook | null;
    if (siteHook) {
      // Check if append mode: run global first, then site on global's result
      if (this.isHookInAppendMode(siteSlug, hookType)) {
        let result = pageTitle;
        const globalHook = this.loadHook('global', hookType) as PageTitleNormalizationHook | null;
        if (globalHook) {
          try {
            result = globalHook.pageTitleNormalization(siteSlug, result);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logSiteWarn(siteSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
          }
        }
        try {
          return siteHook.pageTitleNormalization(siteSlug, result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logSiteWarn(siteSlug, `[HooksLoader] Site hook execution failed: ${errorMessage}`);
          return result;
        }
      }
      // Override mode: site only
      try {
        return siteHook.pageTitleNormalization(siteSlug, pageTitle);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logSiteWarn(siteSlug, `[HooksLoader] Site hook execution failed: ${errorMessage}`);
        return pageTitle;
      }
    }

    // Check if global hook is disabled for this site
    if (this.isHookDisabledForSite(siteSlug, hookType)) {
      return pageTitle;
    }

    // Fall back to global hook
    const globalHook = this.loadHook('global', hookType) as PageTitleNormalizationHook | null;
    if (globalHook) {
      try {
        return globalHook.pageTitleNormalization(siteSlug, pageTitle);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logSiteWarn(siteSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
        return pageTitle;
      }
    }

    return pageTitle;
  }
  
  /**
   * Try to execute markdown processing page hook with site/global precedence
   */
  public static tryExecuteMarkdownProcessingPage(siteSlug: string, mdContent: string): string {
    const hookType: HookType = 'markdownProcessing';

    // First, try to get site-level hook
    const siteHook = this.loadHook('site', hookType, siteSlug) as MarkdownProcessingHook | null;
    if (siteHook) {
      if (this.isHookInAppendMode(siteSlug, hookType)) {
        let result = mdContent;
        const globalHook = this.loadHook('global', hookType) as MarkdownProcessingHook | null;
        if (globalHook) {
          try {
            result = globalHook.markdownProcessingPage(siteSlug, result);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logSiteWarn(siteSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
          }
        }
        try {
          return siteHook.markdownProcessingPage(siteSlug, result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logSiteWarn(siteSlug, `[HooksLoader] Site hook execution failed: ${errorMessage}`);
          return result;
        }
      }
      try {
        return siteHook.markdownProcessingPage(siteSlug, mdContent);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logSiteWarn(siteSlug, `[HooksLoader] Site hook execution failed: ${errorMessage}`);
        return mdContent;
      }
    }

    // Check if global hook is disabled for this site
    if (this.isHookDisabledForSite(siteSlug, hookType)) {
      return mdContent;
    }

    // Fall back to global hook
    const globalHook = this.loadHook('global', hookType) as MarkdownProcessingHook | null;
    if (globalHook) {
      try {
        return globalHook.markdownProcessingPage(siteSlug, mdContent);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logSiteWarn(siteSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
        return mdContent;
      }
    }

    return mdContent;
  }

  /**
   * Try to execute markdown processing backlinks hook with site/global precedence
   */
  public static tryExecuteMarkdownProcessingBacklinks(siteSlug: string, mdContent: string): string {
    const hookType: HookType = 'markdownProcessing';

    // First, try to get site-level hook
    const siteHook = this.loadHook('site', hookType, siteSlug) as MarkdownProcessingHook | null;
    if (siteHook) {
      if (this.isHookInAppendMode(siteSlug, hookType)) {
        let result = mdContent;
        const globalHook = this.loadHook('global', hookType) as MarkdownProcessingHook | null;
        if (globalHook) {
          try {
            result = globalHook.markdownProcessingBacklinks(siteSlug, result);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logSiteWarn(siteSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
          }
        }
        try {
          return siteHook.markdownProcessingBacklinks(siteSlug, result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logSiteWarn(siteSlug, `[HooksLoader] Site hook execution failed: ${errorMessage}`);
          return result;
        }
      }
      try {
        return siteHook.markdownProcessingBacklinks(siteSlug, mdContent);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logSiteWarn(siteSlug, `[HooksLoader] Site hook execution failed: ${errorMessage}`);
        return mdContent;
      }
    }

    // Check if global hook is disabled for this site
    if (this.isHookDisabledForSite(siteSlug, hookType)) {
      return mdContent;
    }

    // Fall back to global hook
    const globalHook = this.loadHook('global', hookType) as MarkdownProcessingHook | null;
    if (globalHook) {
      try {
        return globalHook.markdownProcessingBacklinks(siteSlug, mdContent);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logSiteWarn(siteSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
        return mdContent;
      }
    }

    return mdContent;
  }
  
  /**
   * Try to execute HTML post-processing hook with site/global precedence
   */
  public static tryExecuteHtmlPostProcessing(siteSlug: string, htmlContent: string, pageName: string): string {
    const hookType: HookType = 'htmlPostProcessing';

    // First, try to get site-level hook
    const siteHook = this.loadHook('site', hookType, siteSlug) as HtmlPostProcessingHook | null;
    if (siteHook) {
      if (this.isHookInAppendMode(siteSlug, hookType)) {
        // Append mode: run global first, then site on global's result
        let result = htmlContent;
        const globalHook = this.loadHook('global', hookType) as HtmlPostProcessingHook | null;
        if (globalHook) {
          try {
            const { document } = parseHTML(result);
            globalHook.htmlPostProcessing(siteSlug, document, pageName);
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            result = document.toString();
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logSiteWarn(siteSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
          }
        }
        try {
          const { document } = parseHTML(result);
          siteHook.htmlPostProcessing(siteSlug, document, pageName);
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          return document.toString();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logSiteWarn(siteSlug, `[HooksLoader] Site hook execution failed: ${errorMessage}`);
          return result;
        }
      }
      // Override mode: site only
      try {
        const { document } = parseHTML(htmlContent);
        siteHook.htmlPostProcessing(siteSlug, document, pageName);
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return document.toString();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logSiteWarn(siteSlug, `[HooksLoader] Site hook execution failed: ${errorMessage}`);
        return htmlContent;
      }
    }

    // Check if global hook is disabled for this site
    if (this.isHookDisabledForSite(siteSlug, hookType)) {
      return htmlContent;
    }

    // Fall back to global hook
    const globalHook = this.loadHook('global', hookType) as HtmlPostProcessingHook | null;
    if (globalHook) {
      try {
        const { document } = parseHTML(htmlContent);
        globalHook.htmlPostProcessing(siteSlug, document, pageName);
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return document.toString();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logSiteWarn(siteSlug, `[HooksLoader] Global hook execution failed: ${errorMessage}`);
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
    siteSlug?: string
  ): PageTitleNormalizationHook | MarkdownProcessingHook | HtmlPostProcessingHook | null {
    const cacheKey = this.getCacheKey(scope, hookType, siteSlug);
    
    // Check cache first
    if (this.hooksCache.has(cacheKey)) {
      const cached = this.hooksCache.get(cacheKey)!;
      return cached.hook;
    }
    
    // Load the hook
    const hookPath = this.getHookFilePath(scope, hookType, siteSlug);
    const entry = this.loadHookFromFile(hookPath, hookType);
    this.hooksCache.set(cacheKey, entry);
    
    return entry.hook;
  }
  
  /**
   * Get hook metadata (for API endpoints)
   */
  public static getHookMetadata(scope: HookScope, hookType: HookType, siteSlug?: string): HookMetadata {
    const hookPath = this.getHookFilePath(scope, hookType, siteSlug);
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
      const cacheKey = this.getCacheKey(scope, hookType, siteSlug);
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
  public static getLoadStatus(siteSlug?: string): HookLoadStatus {
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
      
      // Check site hooks if siteSlug provided
      if (siteSlug) {
        const siteCacheKey = this.getCacheKey('site', hookType, siteSlug);
        const siteCached = this.hooksCache.get(siteCacheKey);
        if (siteCached?.error) {
          errors.push({
            hookType,
            scope: 'site',
            error: siteCached.error
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
          pageTitleNormalization: hookFunction as (siteSlug: string, pageTitle: string) => string
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
          markdownProcessingPage: pageFunction as (siteSlug: string, mdContent: string) => string,
          markdownProcessingBacklinks: backlinksFunction as (siteSlug: string, mdContent: string) => string
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
          htmlPostProcessing: hookFunction as (siteSlug: string, document: unknown, pageName: string) => void
        };
      }
    }

    return null;
  }

  /**
   * Clear hooks cache (useful for development/testing)
   */
  public static clearCache(scope?: HookScope, hookType?: HookType, siteSlug?: string): void {
    if (scope && hookType) {
      const cacheKey = this.getCacheKey(scope, hookType, siteSlug);
      this.hooksCache.delete(cacheKey);
    } else {
      this.hooksCache.clear();
    }
  }
}
