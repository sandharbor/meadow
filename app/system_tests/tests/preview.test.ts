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

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  startServer,
  stopServer,
  TEST_BASE_URL,
  getExpectedResultsPath,
  clearHooksCache,
  getSourceGraphsPath
} from '../helpers/serverManager.js';
import { SystemTestSiteSetup } from '../helpers/testSetup.js';

describe('Preview System Tests', () => {
  beforeAll(async () => {
    await startServer();
  });

  afterAll(() => {
    stopServer();
  });

  describe('preview generation via API', () => {
    let testSetup: SystemTestSiteSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestSiteSetup(
        'home_fixture_big_and_small', 
        'preview-test',
        { siteFolderName: 'meadow-test-site-big' }
      );
      testSetup.setUp();
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should generate preview HTML via API', async () => {
      const siteSlug = testSetup!.getSiteSlug();
      
      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/site/${siteSlug}/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);
      
      const result = await response.json() as { success: boolean; message: string };
      expect(result.success).toBe(true);
      expect(result.message).toContain('preview generated');

      // Verify preview folder was created
      const previewFolderPath = testSetup!.getPathInSite('html/preview');
      expect(fs.existsSync(previewFolderPath)).toBe(true);

      // Verify HTML files were generated
      const previewFiles = fs.readdirSync(previewFolderPath);
      const htmlFiles = previewFiles.filter(file => file.endsWith('.html'));
      expect(htmlFiles.length).toBeGreaterThan(0);

      // Should contain _mw_assets directory with expected assets
      expect(previewFiles).toContain('_mw_assets');
      const assetFiles = fs.readdirSync(path.join(previewFolderPath, '_mw_assets'));
      expect(assetFiles.some(f => /^style\.[a-f0-9]{8}\.css$/i.test(f))).toBe(true);
      expect(assetFiles.some(f => /^javascript\.[a-f0-9]{8}\.js$/i.test(f))).toBe(true);
      expect(assetFiles.some(f => /^mermaid\.min\.[a-f0-9]{8}\.js$/i.test(f))).toBe(true);
      expect(assetFiles).toContain('fonts');

      // Should contain the main page HTML
      expect(htmlFiles).toContain('main page.html');
    });

    it('should not create a published folder when previewing', async () => {
      const siteSlug = testSetup!.getSiteSlug();
      
      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/site/${siteSlug}/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      // Verify published folder was NOT created
      const publishedFolderPath = testSetup!.getPathInSite('html/generated_site_versions');
      expect(fs.existsSync(publishedFolderPath)).toBe(false);
    });
  });

  describe('matching the expected preview site', () => {
    let testSetup: SystemTestSiteSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestSiteSetup(
        'home_fixture_big_and_small', 
        'fixture-test',
        { siteFolderName: 'meadow-test-site-big' }
      );
      testSetup.setUp();
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should create content matching the expected preview site', async () => {
      const siteSlug = testSetup!.getSiteSlug();
      
      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/site/${siteSlug}/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      // Get paths
      const previewFolderPath = testSetup!.getPathInSite('html/preview');
      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'meadow-test-site-big-preview');

      // Ensure the expected results folder exists
      expect(fs.existsSync(expectedResultsFolder)).toBe(true);

      // Copy generated preview to expected results folder and check for git changes
      // This serves as a regression test - if output changes, we'll see git diffs
      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(previewFolderPath, expectedResultsFolder, { recursive: true });

      // Check for UNSTAGED changes only - this allows staging expected_results incrementally
      // and committing code + expected_results together once everything looks good
      const gitDiffStatus = execSync('git diff --name-status .', { 
        cwd: expectedResultsFolder, 
        encoding: 'utf8' 
      });
      
      // Also check for untracked files (new files that haven't been staged)
      const gitUntrackedStatus = execSync('git ls-files --others --exclude-standard .', { 
        cwd: expectedResultsFolder, 
        encoding: 'utf8' 
      });
      
      const hasUnstagedChanges = gitDiffStatus.trim().length > 0;
      const hasUntrackedFiles = gitUntrackedStatus.trim().length > 0;
      
      if (hasUnstagedChanges || hasUntrackedFiles) {
        console.log('Unstaged changes detected in expected preview site folder:');
        if (hasUnstagedChanges) {
          console.log('Modified/Deleted files (unstaged):');
          console.log(gitDiffStatus);
          
          const gitDiff = execSync('git diff .', { 
            cwd: expectedResultsFolder, 
            encoding: 'utf8' 
          });
          if (gitDiff.trim()) {
            console.log('Git diff:');
            console.log(gitDiff);
          }
        }
        if (hasUntrackedFiles) {
          console.log('Untracked files:');
          console.log(gitUntrackedStatus);
        }
        
        // Combine both for the error message
        const allChanges = [gitDiffStatus.trim(), gitUntrackedStatus.trim()].filter(Boolean).join('\n');
        expect(allChanges).toBe('');
      }
    });
  });

  describe('matching the expected preview site (srs)', () => {
    let testSetup: SystemTestSiteSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestSiteSetup(
        'home_fixture_srs',
        'fixture-test-srs',
        { siteFolderName: 'meadow-test-site-big' }
      );
      testSetup.setUp();
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should backfill GUIDs into the isolated source graph without mutating the shared fixture', async () => {
      const siteSlug = testSetup!.getSiteSlug();
      const sharedBetaPath = path.join(
        getSourceGraphsPath(),
        'meadow-test-sites-data',
        't022',
        't022 ---- beta cards.md'
      );
      const isolatedBetaPath = testSetup!.getPathInSourceGraph(path.join('t022', 't022 ---- beta cards.md'));
      const isolatedAlphaPath = testSetup!.getPathInSourceGraph(path.join('t022', 't022 ---- alpha cards.md'));

      const sharedBetaBefore = fs.readFileSync(sharedBetaPath, 'utf8');
      const isolatedBetaBefore = fs.readFileSync(isolatedBetaPath, 'utf8');
      const isolatedAlphaBefore = fs.readFileSync(isolatedAlphaPath, 'utf8');

      expect(isolatedBetaBefore).toBe(sharedBetaBefore);

      const response = await fetch(`${TEST_BASE_URL}/api/site/${siteSlug}/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      const isolatedBetaAfter = fs.readFileSync(isolatedBetaPath, 'utf8');
      const isolatedAlphaAfter = fs.readFileSync(isolatedAlphaPath, 'utf8');
      const sharedBetaAfter = fs.readFileSync(sharedBetaPath, 'utf8');

      expect(sharedBetaAfter).toBe(sharedBetaBefore);
      expect(isolatedAlphaAfter).toBe(isolatedAlphaBefore);

      const insertedGuidMatches = Array.from(
        isolatedBetaAfter.matchAll(/<!--MEADOW_SR_GUID:([a-f0-9]{13})-->/g)
      );
      expect(insertedGuidMatches).toHaveLength(3);
      expect(new Set(insertedGuidMatches.map(match => match[1])).size).toBe(3);

      expect(isolatedBetaAfter).toMatch(/<!--SR:!2026-03-12,3,250-->\n\n<!--MEADOW_SR_GUID:[a-f0-9]{13}-->/);
      expect(isolatedBetaAfter).toMatch(/<!--SR:!2026-03-13,4,250-->\n\n<!--MEADOW_SR_GUID:[a-f0-9]{13}-->/);
      expect(isolatedBetaAfter).toMatch(/<!--SR:!2026-03-14,4,250-->\n\n<!--MEADOW_SR_GUID:[a-f0-9]{13}-->/);
    });

    it('should create content matching the expected preview site for srs', async () => {
      const siteSlug = testSetup!.getSiteSlug();

      const response = await fetch(`${TEST_BASE_URL}/api/site/${siteSlug}/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      const previewFolderPath = testSetup!.getPathInSite('html/preview');
      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'meadow-test-site-big-srs-preview');

      expect(fs.existsSync(expectedResultsFolder)).toBe(true);

      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(previewFolderPath, expectedResultsFolder, { recursive: true });

      const gitDiffStatus = execSync('git diff --name-status .', {
        cwd: expectedResultsFolder,
        encoding: 'utf8'
      });

      const gitUntrackedStatus = execSync('git ls-files --others --exclude-standard .', {
        cwd: expectedResultsFolder,
        encoding: 'utf8'
      });

      const hasUnstagedChanges = gitDiffStatus.trim().length > 0;
      const hasUntrackedFiles = gitUntrackedStatus.trim().length > 0;

      if (hasUnstagedChanges || hasUntrackedFiles) {
        console.log('Unstaged changes detected in expected preview site folder:');
        if (hasUnstagedChanges) {
          console.log('Modified/Deleted files (unstaged):');
          console.log(gitDiffStatus);

          const gitDiff = execSync('git diff .', {
            cwd: expectedResultsFolder,
            encoding: 'utf8'
          });
          if (gitDiff.trim()) {
            console.log('Git diff:');
            console.log(gitDiff);
          }
        }
        if (hasUntrackedFiles) {
          console.log('Untracked files:');
          console.log(gitUntrackedStatus);
        }

        const allChanges = [gitDiffStatus.trim(), gitUntrackedStatus.trim()].filter(Boolean).join('\n');
        expect(allChanges).toBe('');
      }
    });
  });

  describe('matching the expected markdown export build (big site)', () => {
    let testSetup: SystemTestSiteSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestSiteSetup(
        'home_fixture_big_and_small',
        'fixture-test-md-export',
        { siteFolderName: 'meadow-test-site-big' }
      );
      testSetup.setUp();

      // Enable markdown ZIP export and SRS on the big site
      const siteConfigPath = testSetup.getPathInSite('conf/site_config.yaml');
      fs.appendFileSync(siteConfigPath, 'generationMarkdownZipEnabled: true\ngenerationSpacedRepetitionEnabled: true\ngenerationSpacedRepetitionTags:\n  - "#t022-srs"\n', 'utf8');
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should create build/markdown_export matching the expected golden set', async () => {
      const siteSlug = testSetup!.getSiteSlug();

      const response = await fetch(`${TEST_BASE_URL}/api/site/${siteSlug}/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      // Verify the intermediate build directory was created
      const markdownExportPath = testSetup!.getPathInSite('build/markdown_export');
      expect(fs.existsSync(markdownExportPath)).toBe(true);

      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'meadow-test-site-big-markdown-export-build');

      // Create expected results folder if it doesn't exist (first run)
      if (!fs.existsSync(expectedResultsFolder)) {
        fs.mkdirSync(expectedResultsFolder, { recursive: true });
        console.log(`Created expected results folder: ${expectedResultsFolder}`);
        console.log('First run - copying generated markdown export to expected results for review.');
      }

      // Copy generated markdown export to expected results folder and check for git changes
      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(markdownExportPath, expectedResultsFolder, { recursive: true });

      // Check for UNSTAGED changes only
      const gitDiffStatus = execSync('git diff --name-status .', {
        cwd: expectedResultsFolder,
        encoding: 'utf8'
      });

      const gitUntrackedStatus = execSync('git ls-files --others --exclude-standard .', {
        cwd: expectedResultsFolder,
        encoding: 'utf8'
      });

      const hasUnstagedChanges = gitDiffStatus.trim().length > 0;
      const hasUntrackedFiles = gitUntrackedStatus.trim().length > 0;

      if (hasUnstagedChanges || hasUntrackedFiles) {
        console.log('Unstaged changes detected in expected markdown export build folder:');
        if (hasUnstagedChanges) {
          console.log('Modified/Deleted files (unstaged):');
          console.log(gitDiffStatus);

          const gitDiff = execSync('git diff .', {
            cwd: expectedResultsFolder,
            encoding: 'utf8'
          });
          if (gitDiff.trim()) {
            console.log('Git diff:');
            console.log(gitDiff);
          }
        }
        if (hasUntrackedFiles) {
          console.log('Untracked files:');
          console.log(gitUntrackedStatus);
        }

        const allChanges = [gitDiffStatus.trim(), gitUntrackedStatus.trim()].filter(Boolean).join('\n');
        expect(allChanges).toBe('');
      }
    });
  });

  describe('matching the expected preview site (nested_and_hooks)', () => {
    let testSetup: SystemTestSiteSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestSiteSetup(
        'home_fixture_nested', 
        'fixture-test-nested',
        { siteFolderName: 'meadow-test-site-nested' }
      );
      testSetup.setUp();
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should create content matching the expected preview site for nested_and_hooks', async () => {
      const siteSlug = testSetup!.getSiteSlug();
      
      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/site/${siteSlug}/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      // Get paths
      const previewFolderPath = testSetup!.getPathInSite('html/preview');
      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'meadow-test-site-nested-preview');

      // Create expected results folder if it doesn't exist (first run)
      if (!fs.existsSync(expectedResultsFolder)) {
        fs.mkdirSync(expectedResultsFolder, { recursive: true });
        console.log(`Created expected results folder: ${expectedResultsFolder}`);
        console.log('First run - copying generated preview to expected results for review.');
      }

      // Copy generated preview to expected results folder and check for git changes
      // This serves as a regression test - if output changes, we'll see git diffs
      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(previewFolderPath, expectedResultsFolder, { recursive: true });

      // Check for UNSTAGED changes only - this allows staging expected_results incrementally
      // and committing code + expected_results together once everything looks good
      const gitDiffStatus = execSync('git diff --name-status .', { 
        cwd: expectedResultsFolder, 
        encoding: 'utf8' 
      });
      
      // Also check for untracked files (new files that haven't been staged)
      const gitUntrackedStatus = execSync('git ls-files --others --exclude-standard .', { 
        cwd: expectedResultsFolder, 
        encoding: 'utf8' 
      });
      
      const hasUnstagedChanges = gitDiffStatus.trim().length > 0;
      const hasUntrackedFiles = gitUntrackedStatus.trim().length > 0;
      
      if (hasUnstagedChanges || hasUntrackedFiles) {
        console.log('Unstaged changes detected in expected preview site folder:');
        if (hasUnstagedChanges) {
          console.log('Modified/Deleted files (unstaged):');
          console.log(gitDiffStatus);
          
          const gitDiff = execSync('git diff .', { 
            cwd: expectedResultsFolder, 
            encoding: 'utf8' 
          });
          if (gitDiff.trim()) {
            console.log('Git diff:');
            console.log(gitDiff);
          }
        }
        if (hasUntrackedFiles) {
          console.log('Untracked files:');
          console.log(gitUntrackedStatus);
        }
        
        // Combine both for the error message
        const allChanges = [gitDiffStatus.trim(), gitUntrackedStatus.trim()].filter(Boolean).join('\n');
        expect(allChanges).toBe('');
      }
    });
  });

  describe('matching the expected preview site (example)', () => {
    let testSetup: SystemTestSiteSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestSiteSetup(
        'home_fixture_example',
        'fixture-test-example',
        { siteFolderName: 'example-site' }
      );
      testSetup.setUp();
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should create content matching the expected preview site for example', async () => {
      const siteSlug = testSetup!.getSiteSlug();

      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/site/${siteSlug}/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      // Get paths
      const previewFolderPath = testSetup!.getPathInSite('html/preview');
      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'example-site-preview');

      // Verify no raw markdown links leaked into the HTML output.
      // This catches cases where markdown like [text](url) wasn't converted to
      // <a> tags, e.g. when an HTML block (like SRS custom elements) swallows
      // adjacent markdown content.
      const htmlFiles = fs.readdirSync(previewFolderPath).filter(f => f.endsWith('.html'));
      for (const htmlFile of htmlFiles) {
        const htmlContent = fs.readFileSync(path.join(previewFolderPath, htmlFile), 'utf-8');
        const rawMarkdownLinks = htmlContent.match(/^\[tag--[^\]]+\]\([^)]+\)$/gm);
        expect(rawMarkdownLinks, `Raw markdown tag link found in ${htmlFile}`).toBeNull();
      }

      // Create expected results folder if it doesn't exist (first run)
      if (!fs.existsSync(expectedResultsFolder)) {
        fs.mkdirSync(expectedResultsFolder, { recursive: true });
        console.log(`Created expected results folder: ${expectedResultsFolder}`);
        console.log('First run - copying generated preview to expected results for review.');
      }

      // Copy generated preview to expected results folder and check for git changes
      // This serves as a regression test - if output changes, we'll see git diffs
      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(previewFolderPath, expectedResultsFolder, { recursive: true });

      // Check for UNSTAGED changes only - this allows staging expected_results incrementally
      // and committing code + expected_results together once everything looks good
      const gitDiffStatus = execSync('git diff --name-status .', {
        cwd: expectedResultsFolder,
        encoding: 'utf8'
      });

      // Also check for untracked files (new files that haven't been staged)
      const gitUntrackedStatus = execSync('git ls-files --others --exclude-standard .', {
        cwd: expectedResultsFolder,
        encoding: 'utf8'
      });

      const hasUnstagedChanges = gitDiffStatus.trim().length > 0;
      const hasUntrackedFiles = gitUntrackedStatus.trim().length > 0;

      if (hasUnstagedChanges || hasUntrackedFiles) {
        console.log('Unstaged changes detected in expected preview site folder:');
        if (hasUnstagedChanges) {
          console.log('Modified/Deleted files (unstaged):');
          console.log(gitDiffStatus);

          const gitDiff = execSync('git diff .', {
            cwd: expectedResultsFolder,
            encoding: 'utf8'
          });
          if (gitDiff.trim()) {
            console.log('Git diff:');
            console.log(gitDiff);
          }
        }
        if (hasUntrackedFiles) {
          console.log('Untracked files:');
          console.log(gitUntrackedStatus);
        }

        // Combine both for the error message
        const allChanges = [gitDiffStatus.trim(), gitUntrackedStatus.trim()].filter(Boolean).join('\n');
        expect(allChanges).toBe('');
      }
    });
  });

  describe('matching the expected preview site (hooks)', () => {
    let testSetup: SystemTestSiteSetup | undefined;

    beforeEach(async () => {
      testSetup = new SystemTestSiteSetup(
        'home_fixture_hooks', 
        'fixture-test-hooks',
        { siteFolderName: 'meadow-test-site-for-hooks' }
      );
      testSetup.setUp();
      
      // Clear hooks cache after setup so the server picks up the newly copied hooks
      if (testSetup.hasHooksSetup()) {
        await clearHooksCache();
      }
    });

    afterEach(async () => {
      // Clear hooks cache before teardown to ensure clean state
      if (testSetup?.hasHooksSetup()) {
        await clearHooksCache();
      }
      testSetup?.tearDown();
    });

    it('should create content matching the expected preview site for hooks', async () => {
      const siteSlug = testSetup!.getSiteSlug();
      
      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/site/${siteSlug}/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      // Get paths
      const previewFolderPath = testSetup!.getPathInSite('html/preview');
      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'meadow-test-site-for-hooks-preview');

      // Create expected results folder if it doesn't exist (first run)
      if (!fs.existsSync(expectedResultsFolder)) {
        fs.mkdirSync(expectedResultsFolder, { recursive: true });
        console.log(`Created expected results folder: ${expectedResultsFolder}`);
        console.log('First run - copying generated preview to expected results for review.');
      }

      // Copy generated preview to expected results folder and check for git changes
      // This serves as a regression test - if output changes, we'll see git diffs
      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(previewFolderPath, expectedResultsFolder, { recursive: true });

      // Check for UNSTAGED changes only - this allows staging expected_results incrementally
      // and committing code + expected_results together once everything looks good
      const gitDiffStatus = execSync('git diff --name-status .', { 
        cwd: expectedResultsFolder, 
        encoding: 'utf8' 
      });
      
      // Also check for untracked files (new files that haven't been staged)
      const gitUntrackedStatus = execSync('git ls-files --others --exclude-standard .', { 
        cwd: expectedResultsFolder, 
        encoding: 'utf8' 
      });
      
      const hasUnstagedChanges = gitDiffStatus.trim().length > 0;
      const hasUntrackedFiles = gitUntrackedStatus.trim().length > 0;
      
      if (hasUnstagedChanges || hasUntrackedFiles) {
        console.log('Unstaged changes detected in expected preview site folder:');
        if (hasUnstagedChanges) {
          console.log('Modified/Deleted files (unstaged):');
          console.log(gitDiffStatus);
          
          const gitDiff = execSync('git diff .', { 
            cwd: expectedResultsFolder, 
            encoding: 'utf8' 
          });
          if (gitDiff.trim()) {
            console.log('Git diff:');
            console.log(gitDiff);
          }
        }
        if (hasUntrackedFiles) {
          console.log('Untracked files:');
          console.log(gitUntrackedStatus);
        }
        
        // Combine both for the error message
        const allChanges = [gitDiffStatus.trim(), gitUntrackedStatus.trim()].filter(Boolean).join('\n');
        expect(allChanges).toBe('');
      }
    });
  });
});
