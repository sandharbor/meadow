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
import { buildExcalidrawClientEmbeddedFileData, linkOrImageHtml } from '../../../../../src/areas/bundle/generation/html/linkModificationService.js';
import { BundleNodeConfig } from '../../../../../../../shared_code/types/bundleNodeConfig.js';
import { makeBundleNodeConfig } from '../../../../shared/support/bundleNodeConfigTestUtils.js';

describe('html link modification', () => {
  it('should not show the name of blacklisted links', () => {
    const confs: BundleNodeConfig[] = [
      makeBundleNodeConfig('my normal page'),
      makeBundleNodeConfig('my sensitive page', 'blacklist'),
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
    const confs: BundleNodeConfig[] = [
      makeBundleNodeConfig('my normal page'),
    ];

    // Test whitelisted link with alternative name
    const result = linkOrImageHtml('my normal page|Custom Title', confs);
    expect(result).toBe('[Custom Title](my%20normal%20page.html)');
  });

  it('should find whitelisted page in subdirectory when linkResolutionMap is unavailable', () => {
    // This tests the fallback behavior: when there's no linkResolutionMap entry,
    // the system should still find the page by title alone and use its subdirectory
    const confs: BundleNodeConfig[] = [
      makeBundleNodeConfig('my subdirectory page', 'whitelist', { sourceGraphSubdirectory: 'ai' }),
    ];

    // Without linkResolutionMap, should fall back to title-only search
    // and find the whitelisted page in 'ai' subdirectory
    const result = linkOrImageHtml('my subdirectory page', confs);
    // Should generate link with correct subdirectory path
    expect(result).toBe('[my subdirectory page](ai/my%20subdirectory%20page.html)');
  });

  it('should find whitelisted page in subdirectory even when linkResolutionMap is empty object', () => {
    const confs: BundleNodeConfig[] = [
      makeBundleNodeConfig('nested page', 'whitelist', { sourceGraphSubdirectory: 'some/nested/path' }),
    ];

    // Pass empty linkResolutionMap (entry not found for this link)
    const result = linkOrImageHtml('nested page', confs, {
      linkResolutionMap: {},  // Empty - no resolution info for this link
    });
    // Should fall back to title-only search and use config's subdirectory
    expect(result).toBe('[nested page](some/nested/path/nested%20page.html)');
  });

  it('should prefer exact match with linkResolutionMap over fallback', () => {
    const confs: BundleNodeConfig[] = [
      makeBundleNodeConfig('duplicate title'),
      makeBundleNodeConfig('duplicate title', 'whitelist', { sourceGraphSubdirectory: 'subdir' }),
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
    const confs: BundleNodeConfig[] = [
      makeBundleNodeConfig('blacklisted subdirectory page', 'blacklist', { sourceGraphSubdirectory: 'ai' }),
    ];

    // Without linkResolutionMap, should fall back to title-only search
    // but should still not whitelist a blacklisted page
    const result = linkOrImageHtml('blacklisted subdirectory page', confs);
    expect(result).toBe('<span class="link-not-tracked">link not tracked</span>');
  });

  it('should NOT use fallback when link has explicit path prefix', () => {
    const confs: BundleNodeConfig[] = [
      makeBundleNodeConfig('some page', 'whitelist', { sourceGraphSubdirectory: 'other-dir' }),
    ];

    // Link has explicit path "nonexistent/some page" - should NOT fall back
    // to finding "some page" in other-dir because user explicitly specified a path
    const result = linkOrImageHtml('nonexistent/some page', confs);
    expect(result).toBe('<span class="link-not-tracked">link not tracked</span>');
  });

  it('should use fallback when link has NO explicit path', () => {
    const confs: BundleNodeConfig[] = [
      makeBundleNodeConfig('some page', 'whitelist', { sourceGraphSubdirectory: 'ai' }),
    ];

    // Link has no explicit path - should fall back to title-only search
    const result = linkOrImageHtml('some page', confs);
    expect(result).toBe('[some page](ai/some%20page.html)');
  });

  it('should resolve Excalidraw embedded file hrefs separately from page links', () => {
    const confs: BundleNodeConfig[] = [
      makeBundleNodeConfig('tracked-sunflower', 'whitelist', {
        fileType: 'png',
        sourceGraphSubdirectory: 't006/images-used-in-excalidraw',
      }),
    ];
    const maps = new Map([
      ['t006/drawing.excalidraw', {
        'tracked-sunflower.png': {
          link_resolved_target_directory: 't006/images-used-in-excalidraw',
          link_resolved_target_path: 't006/images-used-in-excalidraw/tracked-sunflower.png',
        },
        'untracked-pink-flower.png': {
          link_resolved_target_directory: 't006/images-used-in-excalidraw',
          link_resolved_target_path: 't006/images-used-in-excalidraw/untracked-pink-flower.png',
        },
        'linked page': {
          link_resolved_target_directory: 't006',
          link_resolved_target_path: 't006/linked page.md',
        },
      }],
    ]);

    const result = buildExcalidrawClientEmbeddedFileData({
      excalidrawPageIdent: 't006/drawing.excalidraw',
      hostPageDirectory: 't006',
      bundleNodeConfigs: confs,
      allLinkResolutionMaps: maps,
    });

    expect(result.tracked).toEqual({
      'tracked-sunflower.png': 'images-used-in-excalidraw/tracked-sunflower.png',
    });
    expect(result.untracked).toEqual(['untracked-pink-flower.png']);
  });

  it('should render an extensionless embed resolved to an Excalidraw drawing', () => {
    const confs: BundleNodeConfig[] = [
      makeBundleNodeConfig('embedded drawing', 'whitelist', {
        fileType: 'excalidraw',
        sourceGraphSubdirectory: 'drawings',
      }),
    ];

    const result = linkOrImageHtml('embedded drawing|500', confs, {
      linkResolutionMap: {
        'embedded drawing|500': {
          link_resolved_target_directory: 'drawings',
          link_resolved_target_path: 'drawings/embedded drawing.excalidraw',
        },
      },
    });

    expect(result).toContain('class="meadow-excalidraw-embed-link"');
    expect(result).toContain('href="drawings/embedded%20drawing.html"');
    expect(result).toContain('data-meadow-excalidraw-src="drawings/embedded%20drawing.excalidraw.md"');
    expect(result).toContain('style="max-width: 500px"');
  });
});
