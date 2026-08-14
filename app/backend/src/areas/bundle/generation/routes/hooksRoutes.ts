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
import { getConfigDirectory, getBundleDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { HookType, HookScope, HookMetadata, HookValidationResult, PageValidationDiff } from '../../../../../../shared_code/types/hooks.js';
import { AppConfigPaths } from '../../../../../../shared_code/paths/appConfigPaths.js';
import { BundleConfigPaths } from '../../../../../../shared_code/paths/bundleConfigPaths.js';
import { HooksLoader } from '../utils/hooksLoader.js';
import { loadBundleConfig, saveBundleConfig } from '../../../../shared/utils/bundleConfigUtils.js';
import { commitChangesNative, logWithFile, logErrorWithFile } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { PageTitleNormalizationHook, MarkdownProcessingHook, HtmlPostProcessingHook } from '../../../../../../shared_code/types/hooks.js';
import { parseHTML } from 'linkedom';
import { loadBundleNodeConfigMap } from '../html/htmlService.js';
import { getMdContent } from '../html/shared.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

const router = express.Router();

// Helper functions
const getGlobalHooksDirectory = () => AppConfigPaths.getGlobalHooksDir(getConfigDirectory());
const getBundleHooksDirectory = (bundleSlug: string) => BundleConfigPaths.getBundleHooksDir(getBundleDirectory(bundleSlug));

const getHookFilePath = (scope: HookScope, hookType: HookType, bundleSlug?: string): string => {
  if (scope === 'global') {
    return AppConfigPaths.getGlobalHookFile(getConfigDirectory(), hookType);
  }
  return BundleConfigPaths.getBundleHookFile(getBundleDirectory(bundleSlug!), hookType);
};

// Middleware to validate bundleSlug
const validateBundleSlug = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { bundleSlug } = req.params;
  if (!bundleSlug || !/^[a-zA-Z0-9-_]+$/.test(bundleSlug)) {
    res.status(400).json({ error: 'Invalid bundle slug' });
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
  pageTitleNormalization: `function pageTitleNormalization(bundleSlug: string, pageTitle: string): string {
  // Example: Append " page" to all titles
  return pageTitle + ' page';
}`,
  markdownProcessing: `function markdownProcessingPage(bundleSlug: string, mdContent: string): string {
  // Example: Add a bundle-specific banner at the top of every page
  const banner = \`> **Bundle: \${bundleSlug}** - Generated with Meadow\\n\\n\`;
  return banner + mdContent;
}

function markdownProcessingBacklinks(bundleSlug: string, mdContent: string): string {
  // Example: Wrap backlinks section in a collapsible details element
  if (!mdContent.trim()) return mdContent;
  return \`<details>\\n<summary>Show backlinks</summary>\\n\\n\${mdContent}\\n</details>\`;
}`,
  htmlPostProcessing: `function htmlPostProcessing(bundleSlug: string, document: Document, pageName: string): void {
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
router.get('/generation/hooks/global/folder-path', (_req, res) => {
  const dir = getGlobalHooksDirectory();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  res.json({ path: dir });
});

// Get all global hooks
router.get('/generation/hooks/global', (req, res) => {
  const hookTypes: HookType[] = ['pageTitleNormalization', 'markdownProcessing', 'htmlPostProcessing'];
  const hooks: HookMetadata[] = hookTypes.map(hookType => 
    HooksLoader.getHookMetadata('global', hookType)
  );
  
  res.json({ hooks });
});

// Get specific global hook
router.get('/generation/hooks/global/:hookType', validateHookType, (req, res) => {
  const { hookType } = req.params;
  
  const metadata = HooksLoader.getHookMetadata('global', hookType as HookType);
  res.json(metadata);
});

// Create or update global hook
router.put('/generation/hooks/global/:hookType', validateHookType, (req, res) => {
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
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in PUT /generation/hooks/global/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Delete global hook
router.delete('/generation/hooks/global/:hookType', validateHookType, (req, res) => {
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
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in DELETE /generation/hooks/global/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Get bundle hooks folder path (creates it if needed)
router.get('/bundles/:bundleSlug/generation/hooks/folder-path', validateBundleSlug, (req, res) => {
  const { bundleSlug } = req.params;
  const dir = getBundleHooksDirectory(bundleSlug);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  res.json({ path: dir });
});

// Get all hooks for a bundle (includes global hooks with disabled state)
router.get('/bundles/:bundleSlug/generation/hooks', validateBundleSlug, (req, res) => {
  const { bundleSlug } = req.params;

  const hookTypes: HookType[] = ['pageTitleNormalization', 'markdownProcessing', 'htmlPostProcessing'];

  // Load bundle config to check for disabled global hooks and append mode
  const bundleDirectory = getBundleDirectory(bundleSlug);
  const bundleConfig = loadBundleConfig(bundleDirectory);
  const disabledGlobalHooks = bundleConfig.disabledGlobalHooks || [];
  const hookAppendMode = bundleConfig.hookAppendMode || {};

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

    // Get bundle hook
    const bundleMetadata = HooksLoader.getHookMetadata('bundle', hookType, bundleSlug);
    if (bundleMetadata.exists) {
      hooks.push(bundleMetadata);
    }
  }

  res.json({ hooks, hookAppendMode });
});

// Get load status for hooks (for error indicator)
// NOTE: This must be defined BEFORE the :hookType route below,
// otherwise Express matches "load-status" as a :hookType parameter.
router.get('/bundles/:bundleSlug/generation/hooks/load-status', validateBundleSlug, (req, res) => {
  const { bundleSlug } = req.params;

  const loadStatus = HooksLoader.getLoadStatus(bundleSlug);
  res.json(loadStatus);
});

// Get specific bundle hook
router.get('/bundles/:bundleSlug/generation/hooks/:hookType', validateBundleSlug, validateHookType, (req, res) => {
  const { bundleSlug, hookType } = req.params;
  
  const metadata = HooksLoader.getHookMetadata('bundle', hookType as HookType, bundleSlug);
  res.json(metadata);
});

// Create or update bundle hook
router.put('/bundles/:bundleSlug/generation/hooks/:hookType', validateBundleSlug, validateHookType, (req, res) => {
  (async () => {
    const { bundleSlug, hookType } = req.params;
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

    const hooksDir = getBundleHooksDirectory(bundleSlug);
    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }

    const hookPath = getHookFilePath('bundle', hookType as HookType, bundleSlug);
    writeFileSync(hookPath, content, 'utf-8');

    // Clear cache for this hook
    HooksLoader.clearCache('bundle', hookType as HookType, bundleSlug);

    // If adding a bundle-level hook of the same type as a global hook, automatically disable the global hook
    const globalHookExists = HooksLoader.getHookMetadata('global', hookType as HookType).exists;
    if (globalHookExists) {
      const bundleDirectory = getBundleDirectory(bundleSlug);
      const bundleConfig = loadBundleConfig(bundleDirectory);
      const disabledGlobalHooks = bundleConfig.disabledGlobalHooks || [];

      if (!disabledGlobalHooks.includes(hookType)) {
        disabledGlobalHooks.push(hookType);
        bundleConfig.disabledGlobalHooks = disabledGlobalHooks;
        saveBundleConfig(bundleDirectory, bundleConfig);
      }
    }

    // Commit changes
    const configDir = getConfigDirectory();
    try {
      const sha = await commitChangesNative([hooksDir], 'update hooks configuration', { configDir });
      logWithFile(configDir, `[hooksRoutes] Committed bundle hook changes: ${sha}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logErrorWithFile(configDir, `[hooksRoutes] Failed to commit bundle hook changes: ${errMsg}`);
    }

    res.json({ success: true, filePath: hookPath });
  })().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in PUT /bundles/:bundleSlug/generation/hooks/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Delete bundle hook
router.delete('/bundles/:bundleSlug/generation/hooks/:hookType', validateBundleSlug, validateHookType, (req, res) => {
  (async () => {
    const { bundleSlug, hookType } = req.params;

    const hookPath = getHookFilePath('bundle', hookType as HookType, bundleSlug);

    if (!existsSync(hookPath)) {
      res.status(404).json({ error: 'Hook not found' });
      return;
    }

    fs.unlinkSync(hookPath);

    // Clear cache for this hook
    HooksLoader.clearCache('bundle', hookType as HookType, bundleSlug);

    // Commit changes
    const hooksDir = getBundleHooksDirectory(bundleSlug);
    const configDir = getConfigDirectory();
    try {
      const sha = await commitChangesNative([hooksDir], 'delete hook configuration', { configDir });
      logWithFile(configDir, `[hooksRoutes] Committed bundle hook deletion: ${sha}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logErrorWithFile(configDir, `[hooksRoutes] Failed to commit bundle hook deletion: ${errMsg}`);
    }

    res.json({ success: true });
  })().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in DELETE /bundles/:bundleSlug/generation/hooks/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Validate hook and preview changes
router.post('/bundles/:bundleSlug/generation/hooks/validate', validateBundleSlug, (req, res) => {
  const { bundleSlug, hookType, content } = req.body as { 
    bundleSlug: string;
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
    // Load the bundle page configs
    const bundleDirectory = getBundleDirectory(bundleSlug);
    const bundleNodeConfPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
    const bundleNodeConfs = loadBundleNodeConfigMap(bundleNodeConfPath);

    const affectedPages: PageValidationDiff[] = [];
    let totalAffectedCount = 0;
    
    if (hookType === 'pageTitleNormalization') {
      // Test against page titles
      const hook = HooksLoader.parseHookCode(content, hookType) as PageTitleNormalizationHook | null;
      if (!hook) {
        throw new Error('Failed to parse hook');
      }

      const allPages = Object.values(bundleNodeConfs);
      for (const pageConf of allPages) {
        const before = pageConf.bundleNodeName;
        const after = hook.pageTitleNormalization(bundleSlug, pageConf.bundleNodeName);
        
        if (before !== after) {
          totalAffectedCount++;
          if (affectedPages.length < 10) {
            affectedPages.push({
              pageTitle: pageConf.bundleNodeName,
              pageSubdirectory: pageConf.sourceGraphSubdirectory || '',
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

      const generatedHtmlDir = BundleConfigPaths.getGeneratedHtmlDir(bundleDirectory);
      if (existsSync(generatedHtmlDir)) {
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
        collectHtmlFiles(generatedHtmlDir, '');

        for (const { filePath, relPath } of htmlFiles) {
          try {
            const htmlContent = fs.readFileSync(filePath, 'utf-8');
            const { document } = parseHTML(htmlContent);
            const pageName = relPath.replace(/\.html$/, '');
            hook.htmlPostProcessing(bundleSlug, document, pageName);
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
        hook.htmlPostProcessing(bundleSlug, document, 'Sample Page');
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
      
      const allPages = Object.values(bundleNodeConfs);
      for (const pageConf of allPages) {
        // Only test markdown pages
        if (pageConf.bundleNodeKind === 'file' && pageConf.fileType === 'md') {
          // Read the page's markdown content
          const trackedPageContentDir = BundleConfigPaths.getTrackedPageContentDir(bundleDirectory);
          const sourceDir = pageConf.sourceGraphSubdirectory
            ? BundleConfigPaths.getTrackedPageContentSubdir(bundleDirectory, pageConf.sourceGraphSubdirectory)
            : trackedPageContentDir;
          
          try {
            const mdContent = getMdContent(sourceDir, pageConf.bundleNodeName, false);
            if (mdContent) {
              const processedPage = hook.markdownProcessingPage(bundleSlug, mdContent);
              
              if (mdContent !== processedPage) {
                totalAffectedCount++;
                if (affectedPages.length < 10) {
                  affectedPages.push({
                    pageTitle: pageConf.bundleNodeName,
                    pageSubdirectory: pageConf.sourceGraphSubdirectory || '',
                    before: mdContent.substring(0, 500),
                    after: processedPage.substring(0, 500)
                  });
                }
              }
            }
          } catch (error) {
            // Skip pages that can't be read
            logger.warn(`[hooksRoutes] Could not read page ${pageConf.bundleNodeName}:`, error);
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
router.post('/bundles/:bundleSlug/generation/hooks/disabled-global-hooks/:hookType', validateBundleSlug, validateHookType, (req, res) => {
  (async () => {
    const { bundleSlug, hookType } = req.params;
    const { disabled } = req.body as { disabled: boolean };

    if (typeof disabled !== 'boolean') {
      res.status(400).json({ error: 'disabled field is required and must be a boolean' });
      return;
    }

    const bundleDirectory = getBundleDirectory(bundleSlug);
    const bundleConfig = loadBundleConfig(bundleDirectory);
    const disabledGlobalHooks = bundleConfig.disabledGlobalHooks || [];

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

    bundleConfig.disabledGlobalHooks = disabledGlobalHooks;
    saveBundleConfig(bundleDirectory, bundleConfig);

    // Commit changes
    const configDir = getConfigDirectory();
    try {
      const bundleConfigDir = BundleConfigPaths.getConfigDir(bundleDirectory);
      const sha = await commitChangesNative([bundleConfigDir], 'update hooks configuration', { configDir });
      logWithFile(configDir, `[hooksRoutes] Committed disabled hooks change: ${sha}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logErrorWithFile(configDir, `[hooksRoutes] Failed to commit disabled hooks change: ${errMsg}`);
    }

    res.json({ success: true, disabledGlobalHooks });
  })().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in POST /bundles/:bundleSlug/generation/hooks/disabled-global-hooks/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Set hook mode (append or override) for a bundle hook
router.post('/bundles/:bundleSlug/generation/hooks/mode/:hookType', validateBundleSlug, validateHookType, (req, res) => {
  (async () => {
    const { bundleSlug, hookType } = req.params;
    const { mode } = req.body as { mode: 'append' | 'override' };

    if (mode !== 'append' && mode !== 'override') {
      res.status(400).json({ error: 'mode must be "append" or "override"' });
      return;
    }

    const bundleDirectory = getBundleDirectory(bundleSlug);
    const bundleConfig = loadBundleConfig(bundleDirectory);
    const hookAppendMode = bundleConfig.hookAppendMode || {};
    const disabledGlobalHooks = bundleConfig.disabledGlobalHooks || [];

    if (mode === 'append') {
      hookAppendMode[hookType] = true;
      // Remove from disabled list so global hook runs too
      const index = disabledGlobalHooks.indexOf(hookType);
      if (index > -1) {
        disabledGlobalHooks.splice(index, 1);
      }
    } else {
      delete hookAppendMode[hookType];
      // Add to disabled list so only bundle hook runs
      if (!disabledGlobalHooks.includes(hookType)) {
        disabledGlobalHooks.push(hookType);
      }
    }

    bundleConfig.hookAppendMode = hookAppendMode;
    bundleConfig.disabledGlobalHooks = disabledGlobalHooks;
    saveBundleConfig(bundleDirectory, bundleConfig);

    // Commit changes
    const configDir = getConfigDirectory();
    try {
      const bundleConfigDir = BundleConfigPaths.getConfigDir(bundleDirectory);
      const sha = await commitChangesNative([bundleConfigDir], 'update hook mode configuration', { configDir });
      logWithFile(configDir, `[hooksRoutes] Committed hook mode change: ${sha}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logErrorWithFile(configDir, `[hooksRoutes] Failed to commit hook mode change: ${errMsg}`);
    }

    res.json({ success: true, hookAppendMode, disabledGlobalHooks });
  })().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in POST /bundles/:bundleSlug/generation/hooks/mode/:hookType: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Get hook template
router.get('/generation/hooks/templates/:hookType', validateHookType, (req, res) => {
  const { hookType } = req.params;
  
  const template = HOOK_TEMPLATES[hookType as HookType];
  res.json({ template });
});

// Generate agent prompt for custom assets and hooks
router.get('/bundles/:bundleSlug/generation/agent-prompt', validateBundleSlug, (req, res) => {
  const { bundleSlug } = req.params;
  const configDir = getConfigDirectory();
  const bundleDir = getBundleDirectory(bundleSlug);

  // Build paths dynamically from the path classes
  const paths = {
    globalCustomAssetsDir: AppConfigPaths.getGlobalCustomAssetsDir(configDir),
    globalStyleCss: AppConfigPaths.getGlobalCustomAssetFile(configDir, 'style.css'),
    globalJavascriptJs: AppConfigPaths.getGlobalCustomAssetFile(configDir, 'javascript.js'),
    globalHooksDir: AppConfigPaths.getGlobalHooksDir(configDir),
    bundleCustomAssetsDir: BundleConfigPaths.getBundleCustomAssetsDir(bundleDir),
    bundleStyleCss: BundleConfigPaths.getBundleCustomAssetFile(bundleDir, 'style.css'),
    bundleJavascriptJs: BundleConfigPaths.getBundleCustomAssetFile(bundleDir, 'javascript.js'),
    bundleHooksDir: BundleConfigPaths.getBundleHooksDir(bundleDir),
    appConfigFile: AppConfigPaths.getAppConfigFile(configDir),
    bundleConfigFile: BundleConfigPaths.getBundleConfigFile(bundleDir),
  };

  // Build hook file paths and templates dynamically from the HookType list
  const hookTypes: HookType[] = ['pageTitleNormalization', 'markdownProcessing', 'htmlPostProcessing'];
  const hookEntries = hookTypes.map(hookType => ({
    hookType,
    globalPath: AppConfigPaths.getGlobalHookFile(configDir, hookType),
    bundlePath: BundleConfigPaths.getBundleHookFile(bundleDir, hookType),
    template: HOOK_TEMPLATES[hookType],
  }));

  const hookFilesList = hookEntries.map(h =>
    `### ${h.hookType}\n- Global: \`${h.globalPath}\`\n- Bundle: \`${h.bundlePath}\``
  ).join('\n\n');

  const hookTemplates = hookEntries.map(h =>
    `### ${h.hookType}\n\n\`\`\`typescript\n${h.template}\n\`\`\``
  ).join('\n\n');

  const prompt = `# Custom Assets & Hooks — Agent Instructions

You are working with a Meadow bundle called "${bundleSlug}". This bundle supports customization through custom CSS/JS assets and TypeScript hooks. Both can be defined at a **global** level (applies to all bundles) or at a **bundle** level (applies only to this bundle).

## Custom Assets

Custom CSS and JavaScript files can be created or edited directly. If a file does not exist, create it to enable the customization.

### CSS
- **Global**: \`${paths.globalStyleCss}\`
- **Bundle**: \`${paths.bundleStyleCss}\`

### JavaScript
- **Global**: \`${paths.globalJavascriptJs}\`
- **Bundle**: \`${paths.bundleJavascriptJs}\`

**How layering works**: There are three layers of CSS/JS, loaded in order:
1. **Base** (preset) — built-in styling from the selected style preset
2. **Global** — your custom global file (applies to all bundles)
3. **Bundle** — your custom bundle-specific file (applies only to this bundle)

By default, all layers are loaded in order, so each layer **appends** to (and can override rules from) the previous layers. This means:
- To **add** styling on top of the base preset, just write your CSS/JS normally — your rules will layer on top.
- To **completely replace** the base preset styling, set the disable flags (see below) so your file becomes the sole source of styling. Write complete standalone CSS/JS in that case.

### Override Settings (YAML config files)

You can control which layers are active by editing YAML settings directly:

**App-level config** (affects all bundles): \`${paths.appConfigFile}\`
- \`disableBaseStyleCss: true\` — disables the base preset CSS globally
- \`disableBaseJavascriptJs: true\` — disables the base preset JS globally

**Bundle-level config** (overrides for this bundle only): \`${paths.bundleConfigFile}\`
- \`disableBaseStyleCss: true\` — disables the base preset CSS for this bundle
- \`disableBaseJavascriptJs: true\` — disables the base preset JS for this bundle

When a disable flag is set to \`true\`, that layer is skipped entirely. Remove the key or set it to \`false\` to re-enable.

**Example**: To completely replace all default styling for this bundle with your own CSS, set \`disableBaseStyleCss: true\` in the bundle config, then write your full standalone CSS in \`${paths.bundleStyleCss}\`.

## Hooks

Hooks are TypeScript files that transform content during the build process. Each hook file must export specific functions (shown in the templates below). Hooks are written in TypeScript syntax but are transpiled at runtime — do not use \`import\` or \`export\` statements, just define the functions directly.

### Hook Files

${hookFilesList}

### Hook Override Settings

In the bundle config (\`${paths.bundleConfigFile}\`):
- \`disabledGlobalHooks\` — an array of hook type names to disable at the bundle level (e.g. \`["pageTitleNormalization"]\`). When a global hook is disabled for a bundle, only the bundle-level hook runs.
- \`hookAppendMode\` — an object mapping hook types to \`true\` for append mode (e.g. \`{ "markdownProcessing": true }\`). In append mode, the global hook runs first and its output is passed to the bundle hook. When not in append mode (the default), the bundle hook **overrides** the global one entirely.

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
router.post('/bundles/:bundleSlug/generation/agent-prompt/commit', validateBundleSlug, (req, res) => {
  (async () => {
    const { bundleSlug } = req.params;
    const configDir = getConfigDirectory();
    const bundleDir = getBundleDirectory(bundleSlug);

    const directories = [
      AppConfigPaths.getGlobalCustomAssetsDir(configDir),
      AppConfigPaths.getGlobalHooksDir(configDir),
      AppConfigPaths.getAppDir(configDir),
      BundleConfigPaths.getBundleCustomAssetsDir(bundleDir),
      BundleConfigPaths.getBundleHooksDir(bundleDir),
      BundleConfigPaths.getConfigDir(bundleDir),
    ];

    try {
      const sha = await commitChangesNative(
        directories,
        'pre-agent changes global and this bundle config',
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
    logErrorWithFile(getConfigDirectory(), `[hooksRoutes] Error in POST /bundles/:bundleSlug/generation/agent-prompt/commit: ${errMsg}`);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Clear hooks cache (useful for testing and development)
router.post('/generation/hooks/clear-cache', (_req, res) => {
  HooksLoader.clearCache();
  res.json({ success: true });
});

export default router;
