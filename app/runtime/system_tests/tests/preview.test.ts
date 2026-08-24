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
import { SystemTestBundleSetup } from '../helpers/testSetup.js';

function stripPagespecBlocks(content: string): string {
  const lines = content.split(/\r?\n/);
  const output: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '```yaml' && lines[i + 1]?.trim() === 'pagespecs:') {
      i += 2;
      while (i < lines.length && lines[i].trim() !== '```') {
        i++;
      }
      continue;
    }

    output.push(lines[i]);
  }

  return output.join('\n');
}

function removePagespecBlocksFromMarkdownFiles(directory: string): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      removePagespecBlocksFromMarkdownFiles(filePath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      const before = fs.readFileSync(filePath, 'utf8');
      const after = stripPagespecBlocks(before);
      if (after !== before) {
        fs.writeFileSync(filePath, after, 'utf8');
      }
    }
  }
}

describe('Preview System Tests', () => {
  beforeAll(async () => {
    await startServer();
  });

  afterAll(() => {
    stopServer();
  });

  describe('preview generation via API', () => {
    let testSetup: SystemTestBundleSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestBundleSetup(
        'home_fixture_big_and_small', 
        'preview-test',
        { bundleFolderName: 'meadow-test-bundle-big' }
      );
      testSetup.setUp();
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should generate preview HTML via API', async () => {
      const bundleSlug = testSetup!.getBundleSlug();
      
      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);
      
      const result = await response.json() as { success: boolean; message: string };
      expect(result.success).toBe(true);
      expect(result.message).toContain('preview generated');

      // Verify the current generated version directory was created
      const generatedHtmlFolderPath = testSetup!.getCurrentGeneratedHtmlPath();
      expect(fs.existsSync(generatedHtmlFolderPath)).toBe(true);

      // Verify HTML files were generated
      const previewFiles = fs.readdirSync(generatedHtmlFolderPath);
      const htmlFiles = previewFiles.filter(file => file.endsWith('.html'));
      expect(htmlFiles.length).toBeGreaterThan(0);

      // Should contain _mw_assets directory with expected assets
      expect(previewFiles).toContain('_mw_assets');
      const assetFiles = fs.readdirSync(path.join(generatedHtmlFolderPath, '_mw_assets'));
      expect(assetFiles.some(f => /^style\.[a-f0-9]{8}\.css$/i.test(f))).toBe(true);
      expect(assetFiles.some(f => /^javascript\.[a-f0-9]{8}\.js$/i.test(f))).toBe(true);
      expect(assetFiles.some(f => /^mermaid\.min\.[a-f0-9]{8}\.js$/i.test(f))).toBe(true);
      expect(assetFiles).toContain('fonts');

      // Should contain the main page HTML
      expect(htmlFiles).toContain('main page.html');
    });

    it('should create only a version-qualified generated directory when previewing', async () => {
      const bundleSlug = testSetup!.getBundleSlug();
      
      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      const versionRoot = testSetup!.getPathInBundle('html/generated_bundle_versions');
      expect(fs.existsSync(versionRoot)).toBe(true);
      expect(fs.readdirSync(versionRoot).filter(name => /^v[A-Za-z0-9]{6}$/.test(name))).toHaveLength(1);
      expect(fs.existsSync(testSetup!.getPathInBundle('html/generated'))).toBe(false);
    });
  });

  describe('matching the expected preview bundle', () => {
    let testSetup: SystemTestBundleSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestBundleSetup(
        'home_fixture_big_and_small', 
        'fixture-test',
        { bundleFolderName: 'meadow-test-bundle-big' }
      );
      testSetup.setUp();
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should create content matching the expected preview bundle', async () => {
      const bundleSlug = testSetup!.getBundleSlug();
      
      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      // Get paths
      const generatedHtmlFolderPath = testSetup!.getCurrentGeneratedHtmlPath();
      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'meadow-test-bundle-big-preview');

      // Ensure the expected results folder exists
      expect(fs.existsSync(expectedResultsFolder)).toBe(true);

      // Copy generated preview to expected results folder and check for git changes
      // This serves as a regression test - if output changes, we'll see git diffs
      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(generatedHtmlFolderPath, expectedResultsFolder, { recursive: true });

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
        console.log('Unstaged changes detected in expected preview bundle folder:');
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

  describe('matching the expected preview bundle (srs)', () => {
    let testSetup: SystemTestBundleSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestBundleSetup(
        'home_fixture_srs',
        'fixture-test-srs',
        { bundleFolderName: 'meadow-test-bundle-big' }
      );
      testSetup.setUp();
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should backfill GUIDs into the isolated source graph without mutating the shared fixture', async () => {
      const bundleSlug = testSetup!.getBundleSlug();
      const sharedBetaPath = path.join(
        getSourceGraphsPath(),
        'meadow-test-bundles-data',
        't022',
        't022 ---- beta cards.md'
      );
      const isolatedBetaPath = testSetup!.getPathInSourceGraph(path.join('t022', 't022 ---- beta cards.md'));
      const isolatedAlphaPath = testSetup!.getPathInSourceGraph(path.join('t022', 't022 ---- alpha cards.md'));

      const sharedBetaBefore = fs.readFileSync(sharedBetaPath, 'utf8');
      const isolatedBetaBefore = fs.readFileSync(isolatedBetaPath, 'utf8');
      const isolatedAlphaBefore = fs.readFileSync(isolatedAlphaPath, 'utf8');

      expect(isolatedBetaBefore).toBe(sharedBetaBefore);

      const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
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

    it('should create content matching the expected preview bundle for srs', async () => {
      const bundleSlug = testSetup!.getBundleSlug();

      const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      const generatedHtmlFolderPath = testSetup!.getCurrentGeneratedHtmlPath();
      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'meadow-test-bundle-big-srs-preview');

      expect(fs.existsSync(expectedResultsFolder)).toBe(true);

      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(generatedHtmlFolderPath, expectedResultsFolder, { recursive: true });

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
        console.log('Unstaged changes detected in expected preview bundle folder:');
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

  describe('matching the expected sources export build (big bundle)', () => {
    let testSetup: SystemTestBundleSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestBundleSetup(
        'home_fixture_big_and_small',
        'fixture-test-sources-export',
        { bundleFolderName: 'meadow-test-bundle-big' }
      );
      testSetup.setUp();

      // Enable sources ZIP export and SRS on the big bundle
      const bundleConfigPath = testSetup.getPathInBundle('config/bundle_config.yaml');
      fs.appendFileSync(bundleConfigPath, 'generationMarkdownZipEnabled: true\ngenerationSpacedRepetitionEnabled: true\ngenerationSpacedRepetitionTags:\n  - "#t022-srs"\n', 'utf8');
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should create build/sources_export matching the expected golden set', async () => {
      const bundleSlug = testSetup!.getBundleSlug();

      const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      // Verify the intermediate build directory was created
      const sourcesExportPath = testSetup!.getPathInBundle('build/sources_export');
      expect(fs.existsSync(sourcesExportPath)).toBe(true);

      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'meadow-test-bundle-big-markdown-export-build');

      // Create expected results folder if it doesn't exist (first run)
      if (!fs.existsSync(expectedResultsFolder)) {
        fs.mkdirSync(expectedResultsFolder, { recursive: true });
        console.log(`Created expected results folder: ${expectedResultsFolder}`);
        console.log('First run - copying generated sources export to expected results for review.');
      }

      // Copy generated sources export to expected results folder and check for git changes
      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(sourcesExportPath, expectedResultsFolder, { recursive: true });

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
        console.log('Unstaged changes detected in expected sources export build folder:');
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

  describe('matching the expected OKF bundle (big bundle)', () => {
    let testSetup: SystemTestBundleSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestBundleSetup(
        'home_fixture_big_and_small',
        'fixture-test-okf',
        { bundleFolderName: 'meadow-test-bundle-big' }
      );
      testSetup.setUp();
      removePagespecBlocksFromMarkdownFiles(testSetup.getSourceGraphPath());

      const bundleConfigPath = testSetup.getPathInBundle('config/bundle_config.yaml');
      fs.appendFileSync(bundleConfigPath, 'generationOpenKnowledgeFormatEnabled: true\n', 'utf8');
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should create the OKF preview bundle matching the expected golden set', async () => {
      const bundleSlug = testSetup!.getBundleSlug();

      const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      const okfBundlePath = testSetup!.getCurrentGeneratedHtmlPath('_mw_assets/cust/okf/bundle');
      expect(fs.existsSync(okfBundlePath)).toBe(true);

      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'meadow-test-bundle-big-okf-preview');

      if (!fs.existsSync(expectedResultsFolder)) {
        fs.mkdirSync(expectedResultsFolder, { recursive: true });
        console.log(`Created expected results folder: ${expectedResultsFolder}`);
        console.log('First run - copying generated OKF bundle to expected results for review.');
      }

      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(okfBundlePath, expectedResultsFolder, { recursive: true });

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
        console.log('Unstaged changes detected in expected OKF bundle folder:');
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

  describe('matching the expected preview bundle (nested_and_hooks)', () => {
    let testSetup: SystemTestBundleSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestBundleSetup(
        'home_fixture_nested', 
        'fixture-test-nested',
        { bundleFolderName: 'meadow-test-bundle-nested' }
      );
      testSetup.setUp();
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should create content matching the expected preview bundle for nested_and_hooks', async () => {
      const bundleSlug = testSetup!.getBundleSlug();
      
      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      // Get paths
      const generatedHtmlFolderPath = testSetup!.getCurrentGeneratedHtmlPath();
      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'meadow-test-bundle-nested-preview');

      // Create expected results folder if it doesn't exist (first run)
      if (!fs.existsSync(expectedResultsFolder)) {
        fs.mkdirSync(expectedResultsFolder, { recursive: true });
        console.log(`Created expected results folder: ${expectedResultsFolder}`);
        console.log('First run - copying generated preview to expected results for review.');
      }

      // Copy generated preview to expected results folder and check for git changes
      // This serves as a regression test - if output changes, we'll see git diffs
      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(generatedHtmlFolderPath, expectedResultsFolder, { recursive: true });

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
        console.log('Unstaged changes detected in expected preview bundle folder:');
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

  describe('matching the expected preview bundle (example)', () => {
    let testSetup: SystemTestBundleSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestBundleSetup(
        'home_fixture_example',
        'fixture-test-example',
        { bundleFolderName: 'example-bundle' }
      );
      testSetup.setUp();
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('should create content matching the expected preview bundle for example', async () => {
      const bundleSlug = testSetup!.getBundleSlug();

      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      // Get paths
      const generatedHtmlFolderPath = testSetup!.getCurrentGeneratedHtmlPath();
      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'example-bundle-preview');

      // Verify no raw markdown links leaked into the HTML output.
      // This catches cases where markdown like [text](url) wasn't converted to
      // <a> tags, e.g. when an HTML block (like SRS custom elements) swallows
      // adjacent markdown content.
      const htmlFiles = fs.readdirSync(generatedHtmlFolderPath).filter(f => f.endsWith('.html'));
      for (const htmlFile of htmlFiles) {
        const htmlContent = fs.readFileSync(path.join(generatedHtmlFolderPath, htmlFile), 'utf-8');
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
      fs.cpSync(generatedHtmlFolderPath, expectedResultsFolder, { recursive: true });

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
        console.log('Unstaged changes detected in expected preview bundle folder:');
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

  describe('matching the expected preview bundle (hooks)', () => {
    let testSetup: SystemTestBundleSetup | undefined;

    beforeEach(async () => {
      testSetup = new SystemTestBundleSetup(
        'home_fixture_hooks', 
        'fixture-test-hooks',
        { bundleFolderName: 'meadow-test-bundle-for-hooks' }
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

    it('should create content matching the expected preview bundle for hooks', async () => {
      const bundleSlug = testSetup!.getBundleSlug();
      
      // Call the preview API
      const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      // Get paths
      const generatedHtmlFolderPath = testSetup!.getCurrentGeneratedHtmlPath();
      const expectedResultsFolder = path.join(getExpectedResultsPath(), 'meadow-test-bundle-for-hooks-preview');

      // Create expected results folder if it doesn't exist (first run)
      if (!fs.existsSync(expectedResultsFolder)) {
        fs.mkdirSync(expectedResultsFolder, { recursive: true });
        console.log(`Created expected results folder: ${expectedResultsFolder}`);
        console.log('First run - copying generated preview to expected results for review.');
      }

      // Copy generated preview to expected results folder and check for git changes
      // This serves as a regression test - if output changes, we'll see git diffs
      fs.rmSync(expectedResultsFolder, { recursive: true, force: true });
      fs.cpSync(generatedHtmlFolderPath, expectedResultsFolder, { recursive: true });

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
        console.log('Unstaged changes detected in expected preview bundle folder:');
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
