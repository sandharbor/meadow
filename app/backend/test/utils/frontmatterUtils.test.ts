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

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FrontmatterUtils } from '../../src/utils/frontmatterUtils.js';

describe('FrontmatterUtils', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontmatter-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('creates frontmatter when none exists and sets property', () => {
    const testFile = path.join(tempDir, 'test.md');
    const originalContent = 'This is just content without frontmatter';
    
    fs.writeFileSync(testFile, originalContent, 'utf-8');
    
    // Update the sensitive property
    FrontmatterUtils.updateSensitiveProperty(testFile, true);
    
    const updatedContent = fs.readFileSync(testFile, 'utf-8');
    
    expect(updatedContent).toMatch(/^---\n/);
    expect(updatedContent).toContain('meadow-sensitive: true');
    expect(updatedContent).toContain('This is just content without frontmatter');
  });

  test('preserves existing properties when adding new property', () => {
    const testFile = path.join(tempDir, 'test.md');
    const originalContent = `---
title: My Test Page
author: Test Author
---
This is content with existing frontmatter`;
    
    fs.writeFileSync(testFile, originalContent, 'utf-8');
    
    // Update the sensitive property
    FrontmatterUtils.updateSensitiveProperty(testFile, true);
    
    const updatedContent = fs.readFileSync(testFile, 'utf-8');
    
    expect(updatedContent).toContain('title: My Test Page');
    expect(updatedContent).toContain('author: Test Author');
    expect(updatedContent).toContain('meadow-sensitive: true');
    expect(updatedContent).toContain('This is content with existing frontmatter');
  });
}); 