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
import { generateHtmlForSite } from '../../src/html/htmlService.js';
import { TestSiteSetup } from './testSetup.js';
import { HooksLoader } from '../../src/utils/hooksLoader.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';

describe('html preview', () => {
  const testSetup = new TestSiteSetup('with-hooks-site', 'preview-test-site', 'with-hooks-hooks');
  let sitePath: string;

  beforeEach(() => {
    // Clear hooks cache to ensure fresh testing
    HooksLoader.clearCache();
    testSetup.setUp();
    sitePath = testSetup.getSitePath();
  });

  afterEach(() => {
    testSetup.tearDown();
  });

  it('should normalize page names', async () => {
    // Check that preview folder does not exist before generating HTML
    const previewFolderPath = SiteConfigPaths.getPreviewDir(sitePath);
    expect(fs.existsSync(previewFolderPath)).toBe(false);

    // Generate HTML with preview option
    await generateHtmlForSite(sitePath, { preview: true });

    // Check that html folder exists
    const htmlFolderPath = SiteConfigPaths.getHtmlDir(sitePath);
    expect(fs.existsSync(htmlFolderPath)).toBe(true);

    // Check that preview folder exists
    expect(fs.existsSync(previewFolderPath)).toBe(true);

    // Check that the page name was normalized
    const previewFiles = fs.readdirSync(previewFolderPath);
    const htmlFiles = previewFiles.filter(file => file.endsWith('.html'));

    // Verify that pages starting with "test " were transformed to start with "super - "
    // According to the hook function, pages with "test " prefix should become "super - "
    
    // This file should exist with transformed names
    expect(htmlFiles).toContain('superduper - blacklisted.html');
    
    // This file should NOT exist with original "test " prefix
    expect(htmlFiles).not.toContain('test blacklisted.html');
    
    // Files that don't start with "test " should remain unchanged
    expect(htmlFiles).toContain('main page.html');
    expect(htmlFiles).toContain('child 1.html');
    expect(htmlFiles).toContain('child 2.html');
  });

  it('should process markdown with special lines', async () => {
    // Clear cache again to ensure fresh markdown hook loading
    HooksLoader.clearCache();
    
    // Generate HTML with preview option
    await generateHtmlForSite(sitePath, { preview: true });

    const previewFolderPath = SiteConfigPaths.getPreviewDir(sitePath);
    const specialLinesHtmlPath = path.join(previewFolderPath, 'superduper - special lines.html');
    
    // Debug: List all files in the preview folder
    console.log('Preview folder contents:', fs.readdirSync(previewFolderPath));
    console.log('Looking for file:', 'superduper - special lines.html');
    
    // Check that the file was generated
    expect(fs.existsSync(specialLinesHtmlPath)).toBe(true);
    
    // Read the generated HTML content
    const htmlContent = fs.readFileSync(specialLinesHtmlPath, 'utf-8');
    
    // Check that special lines have been processed with <br> tags
    expect(htmlContent).toContain('<br>\n...\n<br>');
    expect(htmlContent).toContain('<br>\n:\n<br>');
    expect(htmlContent).toContain('<br>\n===\n<br>');
  });

  it('should apply htmlPostProcessing hook to generated HTML', async () => {
    HooksLoader.clearCache();

    await generateHtmlForSite(sitePath, { preview: true });

    const previewFolderPath = SiteConfigPaths.getPreviewDir(sitePath);
    const mainPageHtmlPath = path.join(previewFolderPath, 'main page.html');

    expect(fs.existsSync(mainPageHtmlPath)).toBe(true);

    const htmlContent = fs.readFileSync(mainPageHtmlPath, 'utf-8');

    // Check that the htmlPostProcessing hook added attributes to the body
    expect(htmlContent).toContain('data-hook-processed="true"');
    expect(htmlContent).toContain('data-site="preview-test-site"');
  });

  it('should process markdown with video timestamps', async () => {
    // Clear cache again to ensure fresh markdown hook loading
    HooksLoader.clearCache();
    
    // Generate HTML with preview option
    await generateHtmlForSite(sitePath, { preview: true });

    const previewFolderPath = SiteConfigPaths.getPreviewDir(sitePath);
    const videoTimestampsHtmlPath = path.join(previewFolderPath, 'superduper - video timestamps.html');
    
    // Debug: List all files in the preview folder
    console.log('Preview folder contents:', fs.readdirSync(previewFolderPath));
    console.log('Looking for file:', 'superduper - video timestamps.html');
    
    // Check that the file was generated
    expect(fs.existsSync(videoTimestampsHtmlPath)).toBe(true);
    
    // Read the generated HTML content
    const htmlContent = fs.readFileSync(videoTimestampsHtmlPath, 'utf-8');
    
    // Check that timestamps have been converted to links with noreferrer for security
    expect(htmlContent).toContain('At <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s" rel="noreferrer noopener" target="_blank">1:30</a>');
    expect(htmlContent).toContain('At <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=165s" rel="noreferrer noopener" target="_blank">2:45</a>');
    expect(htmlContent).toContain('At <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3615s" rel="noreferrer noopener" target="_blank">1:00:15</a>');
  });

});
