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
import { FrontmatterUtils } from '../../../src/shared/utils/frontmatterUtils.js';

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

  test.each([0o600, 0o640])('creates frontmatter and preserves existing file mode %i', (mode) => {
    const testFile = path.join(tempDir, 'test.md');
    const originalContent = 'This is just content without frontmatter';
    
    fs.writeFileSync(testFile, originalContent, { encoding: 'utf-8', mode });
    // Creation modes are filtered by umask; establish the permission fixture explicitly.
    fs.chmodSync(testFile, mode);
    
    // Update the sensitive property
    FrontmatterUtils.updateSensitiveProperty(testFile, true);
    
    const updatedContent = fs.readFileSync(testFile, 'utf-8');
    
    expect(updatedContent).toMatch(/^---\n/);
    expect(updatedContent).toContain('meadow-sensitive: true');
    expect(updatedContent).toContain('This is just content without frontmatter');
    expect(fs.statSync(testFile).mode & 0o777).toBe(mode);
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

  test('refuses malformed frontmatter without changing its bytes', () => {
    const testFile = path.join(tempDir, 'invalid.md');
    const originalContent = Buffer.from('---\ntitle: [unterminated\n---\nUser content\n');
    fs.writeFileSync(testFile, originalContent);

    expect(() => FrontmatterUtils.updateProperty(testFile, 'title', 'replacement'))
      .toThrow(/Refusing to modify malformed frontmatter/);
    expect(fs.readFileSync(testFile)).toEqual(originalContent);
  });

  // Frontmatter written by other editors and platforms: Windows line endings,
  // a byte order mark, YAML's `...` document end, or a note that is only
  // frontmatter with no final newline.
  test.each([
    ['Windows line endings', '---\r\ntitle: A\r\n---\r\nBody\r\n', 'Body\r\n'],
    ['a byte order mark', '\uFEFF---\ntitle: A\n---\nBody\n', 'Body\n'],
    ['a `...` closing line', '---\ntitle: A\n...\nBody\n', 'Body\n'],
    ['no newline after the closing line', '---\ntitle: A\n---', ''],
  ])('parses frontmatter with %s', (_variant, markdown, body) => {
    expect(FrontmatterUtils.parseFromText(markdown)).toEqual({
      frontmatter: { title: 'A' },
      content: body,
      hasFrontmatter: true,
    });
  });

  test('reads meadow-sensitive from frontmatter with Windows line endings', () => {
    const testFile = path.join(tempDir, 'crlf.md');
    fs.writeFileSync(testFile, '---\r\nmeadow-sensitive: true\r\n---\r\nSecret\r\n');
    expect(FrontmatterUtils.getSensitiveProperty(testFile)).toBe(true);
  });

  test('updates frontmatter with Windows line endings in place, keeping the line endings', () => {
    const testFile = path.join(tempDir, 'crlf.md');
    fs.writeFileSync(testFile, '---\r\ntitle: A\r\n---\r\nBody\r\n');
    FrontmatterUtils.updateSensitiveProperty(testFile, true);
    expect(fs.readFileSync(testFile, 'utf-8')).toBe('---\r\nmeadow-sensitive: true\r\ntitle: A\r\n---\r\nBody\r\n');
  });
});
