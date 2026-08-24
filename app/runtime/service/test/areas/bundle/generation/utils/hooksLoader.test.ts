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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { HooksLoader } from '../../../../../src/areas/bundle/generation/utils/hooksLoader.js';
import { AppConfigPaths } from '../../../../../../../shared_code/paths/appConfigPaths.js';
import { HookType } from '../../../../../../../contracts/types/hooks.js';

describe('HooksLoader', () => {
  const testConfigDir = path.join(os.tmpdir(), 'meadow-test-config');
  const testHooksDir = AppConfigPaths.getGlobalHooksDir(testConfigDir);
  const testPageTitleHookPath = AppConfigPaths.getGlobalHookFile(testConfigDir, 'pageTitleNormalization');
  const testMarkdownHookPath = AppConfigPaths.getGlobalHookFile(testConfigDir, 'markdownProcessing');
  const testHtmlPostProcessingHookPath = AppConfigPaths.getGlobalHookFile(testConfigDir, 'htmlPostProcessing');
  
  beforeEach(() => {
    // Create test directories
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testHooksDir, { recursive: true });
    
    // Clear hooks cache
    HooksLoader.clearCache();
    
    // Set environment variable to use test config directory
    process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = testConfigDir;
  });
  
  afterEach(() => {
    // Clean up
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
    
    // Clear environment variable
    delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
    
    // Clear hooks cache
    HooksLoader.clearCache();
  });
  
  describe('Page Title Normalization', () => {
    it('should return original page title when no hook exists', () => {
      const result = HooksLoader.tryExecutePageTitleNormalization('test-bundle', 'test page');
      expect(result).toBe('test page');
    });

    it('should execute hook and return transformed page title', () => {
      // Create a test hook file
      const hookContent = `
function pageTitleNormalization(bundleSlug, pageTitle) {
  if (bundleSlug === 'test-bundle') {
    return pageTitle.toUpperCase();
  }
  return pageTitle;
}
`;

      fs.writeFileSync(testPageTitleHookPath, hookContent, 'utf-8');

      const result = HooksLoader.tryExecutePageTitleNormalization('test-bundle', 'test page');
      expect(result).toBe('TEST PAGE');
    });

    it('should handle bundle-specific transformations', () => {
      // Create a test hook file with bundle-specific logic
      const hookContent = `
function pageTitleNormalization(bundleSlug, pageTitle) {
  if (bundleSlug === 'personal') {
    return 'Personal: ' + pageTitle;
  }
  if (bundleSlug === 'work') {
    return 'Work: ' + pageTitle;
  }
  return pageTitle;
}
`;

      fs.writeFileSync(testPageTitleHookPath, hookContent, 'utf-8');

      const personalResult = HooksLoader.tryExecutePageTitleNormalization('personal', 'note');
      expect(personalResult).toBe('Personal: note');

      const workResult = HooksLoader.tryExecutePageTitleNormalization('work', 'note');
      expect(workResult).toBe('Work: note');

      const defaultResult = HooksLoader.tryExecutePageTitleNormalization('other', 'note');
      expect(defaultResult).toBe('note');
    });

    it('should cache hook results', () => {
      // Create a test hook file
      const hookContent = `
let callCount = 0;
function pageTitleNormalization(bundleSlug, pageTitle) {
  callCount++;
  return pageTitle + '_' + callCount;
}
`;

      fs.writeFileSync(testPageTitleHookPath, hookContent, 'utf-8');

      // First call should load the hook
      const result1 = HooksLoader.tryExecutePageTitleNormalization('test-bundle', 'test');
      expect(result1).toBe('test_1');

      // Second call should use cached hook, but the function should still increment
      const result2 = HooksLoader.tryExecutePageTitleNormalization('test-bundle', 'test');
      expect(result2).toBe('test_2');
    });

    it('should handle errors gracefully and return original title', () => {
      // Create a test hook file with syntax error
      const hookContent = `
function pageTitleNormalization(bundleSlug, pageTitle) {
  throw new Error('Test error');
}
`;

      fs.writeFileSync(testPageTitleHookPath, hookContent, 'utf-8');

      const result = HooksLoader.tryExecutePageTitleNormalization('test-bundle', 'test page');
      expect(result).toBe('test page');
    });

    it('should handle missing export and find function automatically', () => {
      // Create a test hook file without explicit export
      const hookContent = `
function pageTitleNormalization(bundleSlug, pageTitle) {
  return 'transformed: ' + pageTitle;
}
`;

      fs.writeFileSync(testPageTitleHookPath, hookContent, 'utf-8');

      const result = HooksLoader.tryExecutePageTitleNormalization('test-bundle', 'test page');
      expect(result).toBe('transformed: test page');
    });
  });

  describe('Markdown Processing', () => {
    it('should return original markdown when no hook exists', () => {
      const mdContent = 'Some markdown content';
      const pageResult = HooksLoader.tryExecuteMarkdownProcessingPage('test-bundle', mdContent);
      expect(pageResult).toBe(mdContent);
      
      const backlinksResult = HooksLoader.tryExecuteMarkdownProcessingBacklinks('test-bundle', mdContent);
      expect(backlinksResult).toBe(mdContent);
    });
    
    it('should execute markdown processing hooks', () => {
      // Create a test markdown processing hook file
      const hookContent = `
function markdownProcessingPage(bundleSlug, mdContent) {
  return 'PAGE: ' + mdContent;
}

function markdownProcessingBacklinks(bundleSlug, mdContent) {
  return 'BACKLINKS: ' + mdContent;
}
`;
      
      fs.writeFileSync(testMarkdownHookPath, hookContent, 'utf-8');
      
      const pageResult = HooksLoader.tryExecuteMarkdownProcessingPage('test-bundle', 'test content');
      expect(pageResult).toBe('PAGE: test content');
      
      const backlinksResult = HooksLoader.tryExecuteMarkdownProcessingBacklinks('test-bundle', 'test content');
      expect(backlinksResult).toBe('BACKLINKS: test content');
    });
    
    it('should handle simple markdown transformations', () => {
      // Create a hook that does simple transformations
      const hookContent = `
function markdownProcessingPage(bundleSlug, mdContent) {
  return mdContent.replace(/TRANSFORM/g, 'TRANSFORMED');
}

function markdownProcessingBacklinks(bundleSlug, mdContent) {
  return mdContent.replace(/TRANSFORM/g, 'BACKLINK_TRANSFORMED');
}
`;
      
      fs.writeFileSync(testMarkdownHookPath, hookContent, 'utf-8');
      
      const testContent = 'This should TRANSFORM the content';
      const pageResult = HooksLoader.tryExecuteMarkdownProcessingPage('test-bundle', testContent);
      expect(pageResult).toBe('This should TRANSFORMED the content');
      
      const backlinksResult = HooksLoader.tryExecuteMarkdownProcessingBacklinks('test-bundle', testContent);
      expect(backlinksResult).toBe('This should BACKLINK_TRANSFORMED the content');
    });
    
    it('should handle errors gracefully and return original markdown', () => {
      // Create a test hook file with syntax error
      const hookContent = `
function markdownProcessingPage(bundleSlug, mdContent) {
  throw new Error('Test error');
}

function markdownProcessingBacklinks(bundleSlug, mdContent) {
  throw new Error('Test error');
}
`;
      
      fs.writeFileSync(testMarkdownHookPath, hookContent, 'utf-8');
      
      const testContent = 'test content';
      const pageResult = HooksLoader.tryExecuteMarkdownProcessingPage('test-bundle', testContent);
      expect(pageResult).toBe(testContent);
      
      const backlinksResult = HooksLoader.tryExecuteMarkdownProcessingBacklinks('test-bundle', testContent);
      expect(backlinksResult).toBe(testContent);
    });
  });

  describe('HTML Post-Processing', () => {
    it('should return original HTML when no hook exists', () => {
      const htmlContent = '<html><body><h1>Test</h1></body></html>';
      const result = HooksLoader.tryExecuteHtmlPostProcessing('test-bundle', htmlContent, 'test page');
      expect(result).toBe(htmlContent);
    });

    it('should execute hook that modifies DOM', () => {
      const hookContent = `
function htmlPostProcessing(bundleSlug, document, pageName) {
  const h1 = document.querySelector('h1');
  if (h1) {
    const greeting = document.createElement('h3');
    greeting.textContent = 'Hello from ' + bundleSlug;
    h1.after(greeting);
  }
}
`;
      fs.writeFileSync(testHtmlPostProcessingHookPath, hookContent, 'utf-8');

      const htmlContent = '<html><body><h1>Test</h1></body></html>';
      const result = HooksLoader.tryExecuteHtmlPostProcessing('test-bundle', htmlContent, 'test page');
      expect(result).toContain('<h3>Hello from test-bundle</h3>');
      expect(result).toContain('<h1>Test</h1>');
    });

    it('should execute hook that uses querySelector and setAttribute', () => {
      const hookContent = `
function htmlPostProcessing(bundleSlug, document, pageName) {
  const body = document.querySelector('body');
  if (body) {
    body.setAttribute('data-bundle', bundleSlug);
    body.setAttribute('data-page', pageName);
  }
}
`;
      fs.writeFileSync(testHtmlPostProcessingHookPath, hookContent, 'utf-8');

      const htmlContent = '<html><body><h1>Test</h1></body></html>';
      const result = HooksLoader.tryExecuteHtmlPostProcessing('test-bundle', htmlContent, 'my page');
      expect(result).toContain('data-bundle="test-bundle"');
      expect(result).toContain('data-page="my page"');
    });

    it('should handle errors gracefully and return original HTML', () => {
      const hookContent = `
function htmlPostProcessing(bundleSlug, document, pageName) {
  throw new Error('Test error');
}
`;
      fs.writeFileSync(testHtmlPostProcessingHookPath, hookContent, 'utf-8');

      const htmlContent = '<html><body><h1>Test</h1></body></html>';
      const result = HooksLoader.tryExecuteHtmlPostProcessing('test-bundle', htmlContent, 'test page');
      expect(result).toBe(htmlContent);
    });

    it('should validate htmlPostProcessing hook code', () => {
      const validCode = `function htmlPostProcessing(bundleSlug: string, document: Document, pageName: string): void {
  const h1 = document.querySelector('h1');
}`;
      const result = HooksLoader.validateHookCode('htmlPostProcessing' as HookType, validCode);
      expect(result.success).toBe(true);
    });
  });
}); 