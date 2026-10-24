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

import { describe, it, expect } from 'vitest';
import { frontmatterAsDict, removeFrontmatter } from '../../../../../src/areas/bundle/generation/html/markdown.js';

// The page renderer removes a note's frontmatter before rendering its body,
// and reads it for the optional frontmatter table.
describe('page frontmatter', () => {
  it.each([
    ['Windows line endings', '---\r\ntitle: A\r\n---\r\nBody\r\n', 'Body\r\n'],
    ['a byte order mark', '﻿---\ntitle: A\n---\nBody\n', 'Body\n'],
    ['a `...` closing line', '---\ntitle: A\n...\nBody\n', 'Body\n'],
    ['no newline after the closing line', '---\ntitle: A\n---', ''],
  ])('removes and reads frontmatter with %s', (_variant, markdown, body) => {
    expect(removeFrontmatter(markdown)).toBe(body);
    expect(frontmatterAsDict(markdown)).toEqual({ title: 'A' });
  });

  it('leaves a note without frontmatter, or with an unclosed one, unchanged', () => {
    expect(removeFrontmatter('Body\n')).toBe('Body\n');
    expect(removeFrontmatter('---\ntitle: A\nBody\n')).toBe('---\ntitle: A\nBody\n');
  });
});
