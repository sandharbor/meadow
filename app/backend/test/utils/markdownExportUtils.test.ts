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
import { sanitizeMarkdownLinks } from '../../src/utils/markdownExportUtils.js';
import type { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';

function makeConfig(title: string, listType: 'whitelist' | 'blacklist', fileType?: string, dir?: string): SitePageConfig {
  return {
    title,
    file_type: fileType as SitePageConfig['file_type'],
    source_graph_subdirectory: dir || '',
    config: { list_type: listType },
  };
}

describe('sanitizeMarkdownLinks', () => {
  const configs: SitePageConfig[] = [
    makeConfig('tracked page', 'whitelist'),
    makeConfig('another tracked', 'whitelist'),
    makeConfig('blacklisted page', 'blacklist'),
    makeConfig('my image', 'whitelist', 'png'),
  ];

  it('should leave tracked page links unchanged', () => {
    const input = 'See [[tracked page]] for details.';
    expect(sanitizeMarkdownLinks(input, configs)).toBe(input);
  });

  it('should replace untracked page links with _link not tracked_', () => {
    const input = 'See [[unknown page]] for details.';
    expect(sanitizeMarkdownLinks(input, configs)).toBe('See _link not tracked_ for details.');
  });

  it('should replace blacklisted page links with _link not tracked_', () => {
    const input = 'See [[blacklisted page]] here.';
    expect(sanitizeMarkdownLinks(input, configs)).toBe('See _link not tracked_ here.');
  });

  it('should replace aliased links to untracked pages', () => {
    const input = 'See [[secret|alias for secret]] here.';
    expect(sanitizeMarkdownLinks(input, configs)).toBe('See _link not tracked_ here.');
  });

  it('should leave aliased links to tracked pages unchanged', () => {
    const input = 'See [[tracked page|my alias]] here.';
    expect(sanitizeMarkdownLinks(input, configs)).toBe(input);
  });

  it('should not modify links inside fenced code blocks', () => {
    const input = '```\n[[unknown page]] in code\n```';
    expect(sanitizeMarkdownLinks(input, configs)).toBe(input);
  });

  it('should not modify links inside inline code spans', () => {
    const input = 'Use `[[unknown page]]` as an example.';
    expect(sanitizeMarkdownLinks(input, configs)).toBe(input);
  });

  it('should handle multiple links in one line', () => {
    const input = 'Links: [[tracked page]] and [[unknown page]] and [[another tracked]].';
    expect(sanitizeMarkdownLinks(input, configs)).toBe(
      'Links: [[tracked page]] and _link not tracked_ and [[another tracked]].'
    );
  });

  it('should handle content with no links', () => {
    const input = 'Just plain text with no links.';
    expect(sanitizeMarkdownLinks(input, configs)).toBe(input);
  });

  it('should replace image links to non-whitelisted images', () => {
    const input = 'An image: [[secret.png]]';
    expect(sanitizeMarkdownLinks(input, configs)).toBe('An image: _link not tracked_');
  });

  it('should leave image links to whitelisted images unchanged', () => {
    const input = 'An image: [[my image.png]]';
    expect(sanitizeMarkdownLinks(input, configs)).toBe(input);
  });
});
