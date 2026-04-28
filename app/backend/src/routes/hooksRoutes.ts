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

import express from 'express';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import fs from 'fs';
import { getConfigDirectory, getSiteDirectory } from './siteConfigRoutes.js';
import { HookType, HookScope, HookMetadata, HookValidationResult, PageValidationDiff } from '../../../shared_code/types/hooks.js';
import { AppConfigPaths } from '../../../shared_code/paths/appConfigPaths.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { HooksLoader } from '../utils/hooksLoader.js';
import { loadSiteConfig, saveSiteConfig } from '../utils/siteConfigUtils.js';
import { commitChangesNative, logWithFile, logErrorWithFile } from '../utils/configDirectory/gitUtils/gitStatusUtils.js';
import { PageTitleNormalizationHook, MarkdownProcessingHook, HtmlPostProcessingHook } from '../../../shared_code/types/hooks.js';
import { parseHTML } from 'linkedom';
import { parseSitePageConfig } from '../html/htmlService.js';
import { getMdContent } from '../html/shared.js';
import { logger } from '../utils/logging/backendLoggingUtils.js';

const router = express.Router();

// Helper functions
const getGlobalHooksDirectory = () => AppConfigPaths.getGlobalHooksDir(getConfigDirectory());
const getSiteHooksDirectory = (siteSlug: string) => SiteConfigPaths.getSiteHooksDir(getSiteDirectory(siteSlug));

const getHookFilePath = (scope: HookScope, hookType: HookType, siteSlug?: string): string => {
  if (scope === 'global') {
    return AppConfigPaths.getGlobalHookFile(getConfigDirectory(), hookType);
  }
  return SiteConfigPaths.getSiteHookFile(getSiteDirectory(siteSlug!), hookType);
};

// Middleware to validate siteSlug
const validateSiteSlug = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { siteSlug } = req.params;
  if (!siteSlug || !/^[a-zA-Z0-9-_]+$/.test(siteSlug)) {
    res.status(400).json({ error: 'Invalid site slug' });
    return;
  }
  next();
};

// Helper function to check if a hook type is valid
const isValidHookType = (hookType: string): hookType is HookType => {
  return ['pageTitleNormalization', 'markdownProcessing', 'htmlPostProcessing'].includes(hookType);
};

// Middleware to validate hookType from route params
const validateHookType = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { hookType } = req.params;
  if (!isValidHookType(hookType)) {
    res.status(400).json({ error: 'Invalid hook type: ' + String(hookType) });
    return;
  }
  next();
};

// Hook templates
const HOOK_TEMPLATES: Record<HookType, string> = {
  pageTitleNormalization: `function pageTitleNormalization(siteSlug: string, pageTitle: string): string {
  // Example: Append " page" to all titles
  return pageTitle + ' page';
}`,
  markdownProcessing: `function markdownProcessingPage(siteSlug: string, mdContent: string): string {
  // Example: Add a site-specific banner at the top of every page
  const banner = \`> **Site: \${siteSlug}** - Generated with Meadow\\n\\n\`;
  return banner + mdContent;
}

function markdownProcessingBacklinks(siteSlug: string, mdContent: string): string {
  // Example: Wrap backlinks section in a collapsible details element
  if (!mdContent.trim()) return mdContent;
  return \`<details>\\n<summary>Show backlinks</summary>\\n\\n\${mdContent}\\n</details>\`;
}`,
  htmlPostProcessing: `function htmlPostProcessing(siteSlug: string, document: Document, pageName: string): void {
  // Example: Add a greeting below the page title
  const h1 = document.querySelector('h1');
  if (h1) {
    const greeting = document.createElement('h3');
    greeting.textContent = 'Hello from Meadow';
    h1.after(greeting);
  }
}`
};

// Get global hooks folder path (creates it if needed)
router.get('/global/folder-path', (_req, res) => {
  const dir = getGlobalHooksDirectory();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  res.json({ path: dir });
});

// Get all global hooks
router.get('/global', (req, res) => {
  const hookTypes: HookType[] = ['pageTitleNormalization', 'markdownProcessing', 'htmlPostProcessing'];
  const hooks: HookMetadata[] = hookTypes.map(hookType => 
    HooksLoader.getHookMetadata('global', hookType)
  );
  
  res.json({ hooks });
});

// Get specific global hook
router.get('/global/:hookType', validateHookType, (req, res) => {
  const { hookType } = req.params;
  
  const metadata = HooksLoader.getHookMetadata('global', hookType as HookType);
  res.json(metadata);
});

// Create or update global hook
router.put('/global/:hookType', validateHookType, (req, res) => {
  (async () => {
    const { hookType } = req.params;
    const { content } = req.body as { content: string };

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Hook content is required' });
      return;
    }

    // Validate the hook code
    const validation = HooksLoader.validateHookCode(hookType as HookType, content);
    if (!validation.success) {
      res.status(400).json({ error: `Hook validation failed: ${validation.error}` });
      return;
    }

    const hooksDir = getGlobalHooksDirectory();
    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }

    const hookPath = getHookFilePath('global', hookType as HookType);
    writeFileSync(hookPath, content, 'utf-8');

    // Clear cache for this hook
    HooksLoader.clearCache('global', hookType as HookType);

    // Commit changes
    const configDir = getConfigDirectory();
    try {
      const sha = await commitChangesNative([hooksDir], 'update hooks configuration', { configDir });
      logWithFile(configDir, `[hooksRoutes] Committed hook changes: ${sha}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logErrorWithFile(configDir, `[hooksRoutes] Failed to commit hook changes: ${errMsg}`);
    }

    res.json({ success: true, filePath: hookPath });
  })().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in PUT /global/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Delete global hook
router.delete('/global/:hookType', validateHookType, (req, res) => {
  (async () => {
    const { hookType } = req.params;

    const hookPath = getHookFilePath('global', hookType as HookType);

    if (!existsSync(hookPath)) {
      res.status(404).json({ error: 'Hook not found' });
      return;
    }

    fs.unlinkSync(hookPath);

    // Clear cache for this hook
    HooksLoader.clearCache('global', hookType as HookType);

    // Commit changes
    const hooksDir = getGlobalHooksDirectory();
    const configDir = getConfigDirectory();
    try {
      const sha = await commitChangesNative([hooksDir], 'delete hook configuration', { configDir });
      logWithFile(configDir, `[hooksRoutes] Committed hook deletion: ${sha}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logErrorWithFile(configDir, `[hooksRoutes] Failed to commit hook deletion: ${errMsg}`);
    }

    res.json({ success: true });
  })().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in DELETE /global/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Get site hooks folder path (creates it if needed)
router.get('/site/:siteSlug/hooks/folder-path', validateSiteSlug, (req, res) => {
  const { siteSlug } = req.params;
  const dir = getSiteHooksDirectory(siteSlug);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  res.json({ path: dir });
});

// Get all hooks for a site (includes global hooks with disabled state)
router.get('/site/:siteSlug/hooks', validateSiteSlug, (req, res) => {
  const { siteSlug } = req.params;

  const hookTypes: HookType[] = ['pageTitleNormalization', 'markdownProcessing', 'htmlPostProcessing'];

  // Load site config to check for disabled global hooks and append mode
  const siteDirectory = getSiteDirectory(siteSlug);
  const siteConfig = loadSiteConfig(siteDirectory);
  const disabledGlobalHooks = siteConfig.disabledGlobalHooks || [];
  const hookAppendMode = siteConfig.hookAppendMode || {};

  const hooks: (HookMetadata & { enabled?: boolean })[] = [];

  for (const hookType of hookTypes) {
    // Get global hook
    const globalMetadata = HooksLoader.getHookMetadata('global', hookType);
    if (globalMetadata.exists) {
      hooks.push({
        ...globalMetadata,
        enabled: !disabledGlobalHooks.includes(hookType)
      });
    }

    // Get site hook
    const siteMetadata = HooksLoader.getHookMetadata('site', hookType, siteSlug);
    if (siteMetadata.exists) {
      hooks.push(siteMetadata);
    }
  }

  res.json({ hooks, hookAppendMode });
});

// Get load status for hooks (for error indicator)
// NOTE: This must be defined BEFORE the :hookType route below,
// otherwise Express matches "load-status" as a :hookType parameter.
router.get('/site/:siteSlug/hooks/load-status', validateSiteSlug, (req, res) => {
  const { siteSlug } = req.params;

  const loadStatus = HooksLoader.getLoadStatus(siteSlug);
  res.json(loadStatus);
});

// Get specific site hook
router.get('/site/:siteSlug/hooks/:hookType', validateSiteSlug, validateHookType, (req, res) => {
  const { siteSlug, hookType } = req.params;
  
  const metadata = HooksLoader.getHookMetadata('site', hookType as HookType, siteSlug);
  res.json(metadata);
});

// Create or update site hook
router.put('/site/:siteSlug/hooks/:hookType', validateSiteSlug, validateHookType, (req, res) => {
  (async () => {
    const { siteSlug, hookType } = req.params;
    const { content } = req.body as { content: string };

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Hook content is required' });
      return;
    }

    // Validate the hook code
    const validation = HooksLoader.validateHookCode(hookType as HookType, content);
    if (!validation.success) {
      res.status(400).json({ error: `Hook validation failed: ${validation.error}` });
      return;
    }

    const hooksDir = getSiteHooksDirectory(siteSlug);
    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }

    const hookPath = getHookFilePath('site', hookType as HookType, siteSlug);
    writeFileSync(hookPath, content, 'utf-8');

    // Clear cache for this hook
    HooksLoader.clearCache('site', hookType as HookType, siteSlug);

    // If adding a site-level hook of the same type as a global hook, automatically disable the global hook
    const globalHookExists = HooksLoader.getHookMetadata('global', hookType as HookType).exists;
    if (globalHookExists) {
      const siteDirectory = getSiteDirectory(siteSlug);
      const siteConfig = loadSiteConfig(siteDirectory);
      const disabledGlobalHooks = siteConfig.disabledGlobalHooks || [];

      if (!disabledGlobalHooks.includes(hookType)) {
        disabledGlobalHooks.push(hookType);
        siteConfig.disabledGlobalHooks = disabledGlobalHooks;
        saveSiteConfig(siteDirectory, siteConfig);
      }
    }

    // Commit changes
    const configDir = getConfigDirectory();
    try {
      const sha = await commitChangesNative([hooksDir], 'update hooks configuration', { configDir });
      logWithFile(configDir, `[hooksRoutes] Committed site hook changes: ${sha}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logErrorWithFile(configDir, `[hooksRoutes] Failed to commit site hook changes: ${errMsg}`);
    }

    res.json({ success: true, filePath: hookPath });
  })().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in PUT /site/:siteSlug/hooks/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Delete site hook
router.delete('/site/:siteSlug/hooks/:hookType', validateSiteSlug, validateHookType, (req, res) => {
  (async () => {
    const { siteSlug, hookType } = req.params;

    const hookPath = getHookFilePath('site', hookType as HookType, siteSlug);

    if (!existsSync(hookPath)) {
      res.status(404).json({ error: 'Hook not found' });
      return;
    }

    fs.unlinkSync(hookPath);

    // Clear cache for this hook
    HooksLoader.clearCache('site', hookType as HookType, siteSlug);

    // Commit changes
    const hooksDir = getSiteHooksDirectory(siteSlug);
    const configDir = getConfigDirectory();
    try {
      const sha = await commitChangesNative([hooksDir], 'delete hook configuration', { configDir });
      logWithFile(configDir, `[hooksRoutes] Committed site hook deletion: ${sha}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logErrorWithFile(configDir, `[hooksRoutes] Failed to commit site hook deletion: ${errMsg}`);
    }

    res.json({ success: true });
  })().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in DELETE /site/:siteSlug/hooks/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Validate hook and preview changes
router.post('/site/:siteSlug/hooks/validate', validateSiteSlug, (req, res) => {
  const { siteSlug, hookType, content } = req.body as { 
    siteSlug: string;
    hookType: HookType;
    content: string;
  };
  
  if (!isValidHookType(hookType)) {
    res.status(400).json({ error: 'Invalid hook type: ' + String(hookType)});
    return;
  }
  
  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'Hook content is required' });
    return;
  }
  
  // First, validate that the code compiles
  const validation = HooksLoader.validateHookCode(hookType, content);
  if (!validation.success) {
    const result: HookValidationResult = {
      success: false,
      error: validation.error
    };
    res.json(result);
    return;
  }
  
  // Now test the hook against actual pages
  try {
    // Load the site page configs
    const siteDirectory = getSiteDirectory(siteSlug);
    const sitePageConfPath = SiteConfigPaths.getSitePageConfigFile(siteDirectory);
    const sitePageConfs = parseSitePageConfig(sitePageConfPath);

    const affectedPages: PageValidationDiff[] = [];
    let totalAffectedCount = 0;
    
    if (hookType === 'pageTitleNormalization') {
      // Test against page titles
      const hook = HooksLoader.parseHookCode(content, hookType) as PageTitleNormalizationHook | null;
      if (!hook) {
        throw new Error('Failed to parse hook');
      }

      const allPages = Object.values(sitePageConfs);
      for (const pageConf of allPages) {
        const before = pageConf.title;
        const after = hook.pageTitleNormalization(siteSlug, pageConf.title);
        
        if (before !== after) {
          totalAffectedCount++;
          if (affectedPages.length < 10) {
            affectedPages.push({
              pageTitle: pageConf.title,
              pageSubdirectory: pageConf.source_graph_subdirectory || '',
              before,
              after
            });
          }
        }
      }
    } else if (hookType === 'htmlPostProcessing') {
      // Test against real preview HTML files if available
      const hook = HooksLoader.parseHookCode(content, hookType) as HtmlPostProcessingHook | null;
      if (!hook) {
        throw new Error('Failed to parse hook');
      }

      const previewDir = SiteConfigPaths.getPreviewDir(siteDirectory);
      if (existsSync(previewDir)) {
        // Collect .html files from preview dir and subdirectories
        const htmlFiles: { filePath: string; relPath: string }[] = [];
        const collectHtmlFiles = (dir: string, base: string) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
              collectHtmlFiles(`${dir}/${entry.name}`, `${base}${entry.name}/`);
            } else if (entry.name.endsWith('.html')) {
              htmlFiles.push({ filePath: `${dir}/${entry.name}`, relPath: `${base}${entry.name}` });
            }
          }
        };
        collectHtmlFiles(previewDir, '');

        for (const { filePath, relPath } of htmlFiles) {
          try {
            const htmlContent = fs.readFileSync(filePath, 'utf-8');
            const { document } = parseHTML(htmlContent);
            const pageName = relPath.replace(/\.html$/, '');
            hook.htmlPostProcessing(siteSlug, document, pageName);
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            const afterHtml = document.toString();

            if (htmlContent !== afterHtml) {
              totalAffectedCount++;
              if (affectedPages.length < 10) {
                affectedPages.push({
                  pageTitle: pageName,
                  pageSubdirectory: '',
                  before: htmlContent.substring(0, 500),
                  after: afterHtml.substring(0, 500)
                });
              }
            }
          } catch (error) {
            logger.warn(`[hooksRoutes] Could not process preview file ${relPath}:`, error);
          }
        }
      } else {
        // Fall back to sample page if no preview exists
        const sampleHtml = '<html><head><title>Sample Page</title></head><body><h1>Sample Page</h1><p>This is sample content.</p></body></html>';
        const { document } = parseHTML(sampleHtml);
        hook.htmlPostProcessing(siteSlug, document, 'Sample Page');
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const afterHtml = document.toString();

        if (sampleHtml !== afterHtml) {
          totalAffectedCount = 1;
          affectedPages.push({
            pageTitle: 'Sample Page',
            pageSubdirectory: '',
            before: sampleHtml.substring(0, 500),
            after: afterHtml.substring(0, 500)
          });
        }
      }
    } else if (hookType === 'markdownProcessing') {
      // Test against markdown content
      const hook = HooksLoader.parseHookCode(content, hookType) as MarkdownProcessingHook | null;
      if (!hook) {
        throw new Error('Failed to parse hook');
      }
      
      const allPages = Object.values(sitePageConfs);
      for (const pageConf of allPages) {
        // Only test markdown pages
        if (pageConf.file_type === 'md' || !pageConf.file_type) {
          // Read the page's markdown content
          const trackedPageContentDir = SiteConfigPaths.getTrackedPageContentDir(siteDirectory);
          const sourceDir = pageConf.source_graph_subdirectory
            ? SiteConfigPaths.getTrackedPageContentSubdir(siteDirectory, pageConf.source_graph_subdirectory)
            : trackedPageContentDir;
          
          try {
            const mdContent = getMdContent(sourceDir, pageConf.title, false);
            if (mdContent) {
              const processedPage = hook.markdownProcessingPage(siteSlug, mdContent);
              
              if (mdContent !== processedPage) {
                totalAffectedCount++;
                if (affectedPages.length < 10) {
                  affectedPages.push({
                    pageTitle: pageConf.title,
                    pageSubdirectory: pageConf.source_graph_subdirectory || '',
                    before: mdContent.substring(0, 500),
                    after: processedPage.substring(0, 500)
                  });
                }
              }
            }
          } catch (error) {
            // Skip pages that can't be read
            logger.warn(`[hooksRoutes] Could not read page ${pageConf.title}:`, error);
          }
        }
      }
    }
    
    const result: HookValidationResult = {
      success: true,
      affectedPages,
      totalAffectedCount
    };
    res.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result: HookValidationResult = {
      success: false,
      error: `Failed to test hook: ${errorMessage}`
    };
    res.json(result);
  }
});

// Toggle disabled state for a global hook
router.post('/site/:siteSlug/disabled-global-hooks/:hookType', validateSiteSlug, validateHookType, (req, res) => {
  (async () => {
    const { siteSlug, hookType } = req.params;
    const { disabled } = req.body as { disabled: boolean };

    if (typeof disabled !== 'boolean') {
      res.status(400).json({ error: 'disabled field is required and must be a boolean' });
      return;
    }

    const siteDirectory = getSiteDirectory(siteSlug);
    const siteConfig = loadSiteConfig(siteDirectory);
    const disabledGlobalHooks = siteConfig.disabledGlobalHooks || [];

    if (disabled) {
      // Add to disabled list if not already there
      if (!disabledGlobalHooks.includes(hookType)) {
        disabledGlobalHooks.push(hookType);
      }
    } else {
      // Remove from disabled list
      const index = disabledGlobalHooks.indexOf(hookType);
      if (index > -1) {
        disabledGlobalHooks.splice(index, 1);
      }
    }

    siteConfig.disabledGlobalHooks = disabledGlobalHooks;
    saveSiteConfig(siteDirectory, siteConfig);

    // Commit changes
    const configDir = getConfigDirectory();
    try {
      const confDir = SiteConfigPaths.getConfDir(siteDirectory);
      const sha = await commitChangesNative([confDir], 'update hooks configuration', { configDir });
      logWithFile(configDir, `[hooksRoutes] Committed disabled hooks change: ${sha}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logErrorWithFile(configDir, `[hooksRoutes] Failed to commit disabled hooks change: ${errMsg}`);
    }

    res.json({ success: true, disabledGlobalHooks });
  })().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in POST /site/:siteSlug/disabled-global-hooks/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Set hook mode (append or override) for a site hook
router.post('/site/:siteSlug/hook-mode/:hookType', validateSiteSlug, validateHookType, (req, res) => {
  (async () => {
    const { siteSlug, hookType } = req.params;
    const { mode } = req.body as { mode: 'append' | 'override' };

    if (mode !== 'append' && mode !== 'override') {
      res.status(400).json({ error: 'mode must be "append" or "override"' });
      return;
    }

    const siteDirectory = getSiteDirectory(siteSlug);
    const siteConfig = loadSiteConfig(siteDirectory);
    const hookAppendMode = siteConfig.hookAppendMode || {};
    const disabledGlobalHooks = siteConfig.disabledGlobalHooks || [];

    if (mode === 'append') {
      hookAppendMode[hookType] = true;
      // Remove from disabled list so global hook runs too
      const index = disabledGlobalHooks.indexOf(hookType);
      if (index > -1) {
        disabledGlobalHooks.splice(index, 1);
      }
    } else {
      delete hookAppendMode[hookType];
      // Add to disabled list so only site hook runs
      if (!disabledGlobalHooks.includes(hookType)) {
        disabledGlobalHooks.push(hookType);
      }
    }

    siteConfig.hookAppendMode = hookAppendMode;
    siteConfig.disabledGlobalHooks = disabledGlobalHooks;
    saveSiteConfig(siteDirectory, siteConfig);

    // Commit changes
    const configDir = getConfigDirectory();
    try {
      const confDir = SiteConfigPaths.getConfDir(siteDirectory);
      const sha = await commitChangesNative([confDir], 'update hook mode configuration', { configDir });
      logWithFile(configDir, `[hooksRoutes] Committed hook mode change: ${sha}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logErrorWithFile(configDir, `[hooksRoutes] Failed to commit hook mode change: ${errMsg}`);
    }

    res.json({ success: true, hookAppendMode, disabledGlobalHooks });
  })().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in POST /site/:siteSlug/hook-mode/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Get hook template
router.get('/templates/:hookType', validateHookType, (req, res) => {
  const { hookType } = req.params;
  
  const template = HOOK_TEMPLATES[hookType as HookType];
  res.json({ template });
});

// Generate agent prompt for custom assets and hooks
router.get('/agent-prompt/:siteSlug', validateSiteSlug, (req, res) => {
  const { siteSlug } = req.params;
  const configDir = getConfigDirectory();
  const siteDir = getSiteDirectory(siteSlug);

  // Build paths dynamically from the path classes
  const paths = {
    globalCustomAssetsDir: AppConfigPaths.getGlobalCustomAssetsDir(configDir),
    globalStyleCss: AppConfigPaths.getGlobalCustomAssetFile(configDir, 'style.css'),
    globalJavascriptJs: AppConfigPaths.getGlobalCustomAssetFile(configDir, 'javascript.js'),
    globalHooksDir: AppConfigPaths.getGlobalHooksDir(configDir),
    siteCustomAssetsDir: SiteConfigPaths.getSiteCustomAssetsDir(siteDir),
    siteStyleCss: SiteConfigPaths.getSiteCustomAssetFile(siteDir, 'style.css'),
    siteJavascriptJs: SiteConfigPaths.getSiteCustomAssetFile(siteDir, 'javascript.js'),
    siteHooksDir: SiteConfigPaths.getSiteHooksDir(siteDir),
    appConfigFile: AppConfigPaths.getAppConfigFile(configDir),
    siteConfigFile: SiteConfigPaths.getSiteConfigFile(siteDir),
  };

  // Build hook file paths and templates dynamically from the HookType list
  const hookTypes: HookType[] = ['pageTitleNormalization', 'markdownProcessing', 'htmlPostProcessing'];
  const hookEntries = hookTypes.map(hookType => ({
    hookType,
    globalPath: AppConfigPaths.getGlobalHookFile(configDir, hookType),
    sitePath: SiteConfigPaths.getSiteHookFile(siteDir, hookType),
    template: HOOK_TEMPLATES[hookType],
  }));

  const hookFilesList = hookEntries.map(h =>
    `### ${h.hookType}\n- Global: \`${h.globalPath}\`\n- Site: \`${h.sitePath}\``
  ).join('\n\n');

  const hookTemplates = hookEntries.map(h =>
    `### ${h.hookType}\n\n\`\`\`typescript\n${h.template}\n\`\`\``
  ).join('\n\n');

  const prompt = `# Custom Assets & Hooks — Agent Instructions

You are working with a Meadow site called "${siteSlug}". This site supports customization through custom CSS/JS assets and TypeScript hooks. Both can be defined at a **global** level (applies to all sites) or at a **site** level (applies only to this site).

## Custom Assets

Custom CSS and JavaScript files can be created or edited directly. If a file does not exist, create it to enable the customization.

### CSS
- **Global**: \`${paths.globalStyleCss}\`
- **Site**: \`${paths.siteStyleCss}\`

### JavaScript
- **Global**: \`${paths.globalJavascriptJs}\`
- **Site**: \`${paths.siteJavascriptJs}\`

**How layering works**: There are three layers of CSS/JS, loaded in order:
1. **Base** (preset) — built-in styling from the selected style preset
2. **Global** — your custom global file (applies to all sites)
3. **Site** — your custom site-specific file (applies only to this site)

By default, all layers are loaded in order, so each layer **appends** to (and can override rules from) the previous layers. This means:
- To **add** styling on top of the base preset, just write your CSS/JS normally — your rules will layer on top.
- To **completely replace** the base preset styling, set the disable flags (see below) so your file becomes the sole source of styling. Write complete standalone CSS/JS in that case.

### Override Settings (YAML config files)

You can control which layers are active by editing YAML settings directly:

**App-level config** (affects all sites): \`${paths.appConfigFile}\`
- \`disableBaseStyleCss: true\` — disables the base preset CSS globally
- \`disableBaseJavascriptJs: true\` — disables the base preset JS globally

**Site-level config** (overrides for this site only): \`${paths.siteConfigFile}\`
- \`disableBaseStyleCss: true\` — disables the base preset CSS for this site
- \`disableBaseJavascriptJs: true\` — disables the base preset JS for this site

When a disable flag is set to \`true\`, that layer is skipped entirely. Remove the key or set it to \`false\` to re-enable.

**Example**: To completely replace all default styling for this site with your own CSS, set \`disableBaseStyleCss: true\` in the site config, then write your full standalone CSS in \`${paths.siteStyleCss}\`.

## Hooks

Hooks are TypeScript files that transform content during the build process. Each hook file must export specific functions (shown in the templates below). Hooks are written in TypeScript syntax but are transpiled at runtime — do not use \`import\` or \`export\` statements, just define the functions directly.

### Hook Files

${hookFilesList}

### Hook Override Settings

In the site config (\`${paths.siteConfigFile}\`):
- \`disabledGlobalHooks\` — an array of hook type names to disable at the site level (e.g. \`["pageTitleNormalization"]\`). When a global hook is disabled for a site, only the site-level hook runs.
- \`hookAppendMode\` — an object mapping hook types to \`true\` for append mode (e.g. \`{ "markdownProcessing": true }\`). In append mode, the global hook runs first and its output is passed to the site hook. When not in append mode (the default), the site hook **overrides** the global one entirely.

## Hook Templates

These are working examples showing the function signatures and expected patterns for each hook type. Use these as your starting point:

${hookTemplates}

## Important Notes

- Hook files are TypeScript (\`.ts\`) but must NOT use \`import\`/\`export\` — just define the named functions directly.
- The \`htmlPostProcessing\` hook receives a DOM \`Document\` object (linkedom) for manipulation. Modify it in place; do not return a value.
- The \`markdownProcessing\` hook has two functions: \`markdownProcessingPage\` (for main page content) and \`markdownProcessingBacklinks\` (for the backlinks section).
- Custom asset files are plain CSS/JS — no special format needed.
- After creating or modifying these files, use the refresh button in the Customize sidebar (or the app will detect changes automatically on the next build).
`;

  res.json({ prompt, configDir });
});

// Create a pre-agent checkpoint commit
router.post('/agent-prompt/:siteSlug/commit', validateSiteSlug, (req, res) => {
  (async () => {
    const { siteSlug } = req.params;
    const configDir = getConfigDirectory();
    const siteDir = getSiteDirectory(siteSlug);

    const directories = [
      AppConfigPaths.getGlobalCustomAssetsDir(configDir),
      AppConfigPaths.getGlobalHooksDir(configDir),
      AppConfigPaths.getAppDir(configDir),
      SiteConfigPaths.getSiteCustomAssetsDir(siteDir),
      SiteConfigPaths.getSiteHooksDir(siteDir),
      SiteConfigPaths.getConfDir(siteDir),
    ];

    try {
      const sha = await commitChangesNative(
        directories,
        'pre-agent changes global and this site config',
        { configDir, allowEmpty: true }
      );
      logWithFile(configDir, `[hooksRoutes] Pre-agent checkpoint commit: ${sha}`);
      res.json({ success: true, sha });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logErrorWithFile(configDir, `[hooksRoutes] Failed pre-agent checkpoint commit: ${errMsg}`);
      res.status(500).json({ error: 'Failed to create checkpoint commit' });
    }
  })().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in POST /agent-prompt/:siteSlug/commit: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Clear hooks cache (useful for testing and development)
router.post('/clear-cache', (_req, res) => {
  HooksLoader.clearCache();
  res.json({ success: true });
});

export default router;

