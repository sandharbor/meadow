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
import { linkOrImageHtml } from '../../src/html/linkModificationService.js';
import { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';

describe('html link modification', () => {
  it('should not show the name of blacklisted links', () => {
    const confs: SitePageConfig[] = [
      {
        title: 'my normal page',
        config: {
          list_type: 'whitelist',
        },
      },
      {
        title: 'my sensitive page',
        config: {
          list_type: 'blacklist',
        },
      },
    ];

    // Test whitelisted link - should create proper link
    const whitelistedResult = linkOrImageHtml('my normal page', confs);
    expect(whitelistedResult).toBe('[my normal page](my%20normal%20page.html)');

    // Test non-whitelisted link - should return span with message
    const nonWhitelistedResult = linkOrImageHtml('some other page', confs);
    expect(nonWhitelistedResult).toBe('<span class="link-not-tracked">link not tracked</span>');

    // Test blacklisted link - should also return span with message (not whitelisted)
    const blacklistedResult = linkOrImageHtml('my sensitive page', confs);
    expect(blacklistedResult).toBe('<span class="link-not-tracked">link not tracked</span>');
  });

  it('should handle alternative link names for whitelisted pages', () => {
    const confs: SitePageConfig[] = [
      {
        title: 'my normal page',
        config: {
          list_type: 'whitelist',
        },
      },
    ];

    // Test whitelisted link with alternative name
    const result = linkOrImageHtml('my normal page|Custom Title', confs);
    expect(result).toBe('[Custom Title](my%20normal%20page.html)');
  });

  it('should find whitelisted page in subdirectory when linkResolutionMap is unavailable', () => {
    // This tests the fallback behavior: when there's no linkResolutionMap entry,
    // the system should still find the page by title alone and use its subdirectory
    const confs: SitePageConfig[] = [
      {
        title: 'my subdirectory page',
        source_graph_subdirectory: 'ai',
        config: {
          list_type: 'whitelist',
        },
      },
    ];

    // Without linkResolutionMap, should fall back to title-only search
    // and find the whitelisted page in 'ai' subdirectory
    const result = linkOrImageHtml('my subdirectory page', confs);
    // Should generate link with correct subdirectory path
    expect(result).toBe('[my subdirectory page](ai/my%20subdirectory%20page.html)');
  });

  it('should find whitelisted page in subdirectory even when linkResolutionMap is empty object', () => {
    const confs: SitePageConfig[] = [
      {
        title: 'nested page',
        source_graph_subdirectory: 'some/nested/path',
        config: {
          list_type: 'whitelist',
        },
      },
    ];

    // Pass empty linkResolutionMap (entry not found for this link)
    const result = linkOrImageHtml('nested page', confs, {
      linkResolutionMap: {},  // Empty - no resolution info for this link
    });
    // Should fall back to title-only search and use config's subdirectory
    expect(result).toBe('[nested page](some/nested/path/nested%20page.html)');
  });

  it('should prefer exact match with linkResolutionMap over fallback', () => {
    const confs: SitePageConfig[] = [
      {
        title: 'duplicate title',
        source_graph_subdirectory: '',  // Root level
        config: {
          list_type: 'whitelist',
        },
      },
      {
        title: 'duplicate title',
        source_graph_subdirectory: 'subdir',
        config: {
          list_type: 'whitelist',
        },
      },
    ];

    // With linkResolutionMap pointing to subdir, should use that
    const resultWithResolution = linkOrImageHtml('duplicate title', confs, {
      linkResolutionMap: {
        'duplicate title': {
          link_resolved_target_directory: 'subdir',
          link_resolved_target_path: 'subdir/duplicate title.md',
        },
      },
    });
    expect(resultWithResolution).toBe('[duplicate title](subdir/duplicate%20title.html)');

    // With linkResolutionMap pointing to root, should use root
    const resultWithRootResolution = linkOrImageHtml('duplicate title', confs, {
      linkResolutionMap: {
        'duplicate title': {
          link_resolved_target_directory: '',
          link_resolved_target_path: 'duplicate title.md',
        },
      },
    });
    expect(resultWithRootResolution).toBe('[duplicate title](duplicate%20title.html)');
  });

  it('should not whitelist page in subdirectory if it is blacklisted', () => {
    const confs: SitePageConfig[] = [
      {
        title: 'blacklisted subdirectory page',
        source_graph_subdirectory: 'ai',
        config: {
          list_type: 'blacklist',
        },
      },
    ];

    // Without linkResolutionMap, should fall back to title-only search
    // but should still not whitelist a blacklisted page
    const result = linkOrImageHtml('blacklisted subdirectory page', confs);
    expect(result).toBe('<span class="link-not-tracked">link not tracked</span>');
  });

  it('should NOT use fallback when link has explicit path prefix', () => {
    const confs: SitePageConfig[] = [
      {
        title: 'some page',
        source_graph_subdirectory: 'other-dir',  // Different from explicit path
        config: {
          list_type: 'whitelist',
        },
      },
    ];

    // Link has explicit path "nonexistent/some page" - should NOT fall back
    // to finding "some page" in other-dir because user explicitly specified a path
    const result = linkOrImageHtml('nonexistent/some page', confs);
    expect(result).toBe('<span class="link-not-tracked">link not tracked</span>');
  });

  it('should use fallback when link has NO explicit path', () => {
    const confs: SitePageConfig[] = [
      {
        title: 'some page',
        source_graph_subdirectory: 'ai',
        config: {
          list_type: 'whitelist',
        },
      },
    ];

    // Link has no explicit path - should fall back to title-only search
    const result = linkOrImageHtml('some page', confs);
    expect(result).toBe('[some page](ai/some%20page.html)');
  });
});
