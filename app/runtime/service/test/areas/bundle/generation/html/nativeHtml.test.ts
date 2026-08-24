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

import { describe, expect, it } from 'vitest';
import type { BundleConfig } from '../../../../../../../shared_code/types/bundleConfig.js';
import type { BundleNodeConfig } from '../../../../../../../shared_code/types/bundleNodeConfig.js';
import { rewriteNativeHtmlUrls } from '../../../../../src/areas/bundle/generation/html/nativeHtml.js';

const configs: BundleNodeConfig[] = [
  { bundleNodeName: 'Home', bundleNodeKind: 'file', fileType: 'md', bundleNodeId: 'aaaaaaaaaaaa', listType: 'whitelist' },
  { bundleNodeName: 'Second', sourceGraphSubdirectory: 'pages', bundleNodeKind: 'file', fileType: 'html', bundleNodeId: 'bbbbbbbbbbbb', listType: 'whitelist' },
  { bundleNodeName: 'shared', sourceGraphSubdirectory: 'pages', bundleNodeKind: 'file', fileType: 'css', bundleNodeId: 'cccccccccccc', listType: 'whitelist' },
];
const bundleConfig = { entryBundleNodeId: 'aaaaaaaaaaaa' } as BundleConfig;

describe('rewriteNativeHtmlUrls', () => {
  it('routes source pages and preserves asset extensions', () => {
    const content = '<a href="../Home.md">Home</a><link href="./shared.css"><a href="./Second.html">Second</a>';
    const rewritten = rewriteNativeHtmlUrls({
      content,
      currentOutputDirectory: 'pages',
      linkResolutionMap: {
        '../Home.md': { link_resolved_target_directory: '', link_resolved_target_path: 'Home.md' },
        './shared.css': { link_resolved_target_directory: 'pages', link_resolved_target_path: 'pages/shared.css' },
        './Second.html': { link_resolved_target_directory: 'pages', link_resolved_target_path: 'pages/Second.html' },
      },
      bundleNodeConfigs: configs,
      bundleConfig,
      routeTable: new Map([
        ['aaaaaaaaaaaa', 'Home.html'],
        ['bbbbbbbbbbbb', 'pages/Second.html'],
        ['cccccccccccc', 'pages/shared.html'],
      ]),
    });

    expect(rewritten).toBe('<a href="../Home.html">Home</a><link href="shared.css"><a href="Second.html">Second</a>');
  });

  it('leaves external URLs alone and neutralizes resolved untracked links', () => {
    const content = '<a href="https://example.com">External</a><a href="./private.md">Private</a>';
    const rewritten = rewriteNativeHtmlUrls({
      content,
      currentOutputDirectory: 'pages',
      linkResolutionMap: {
        './private.md': { link_resolved_target_directory: 'pages', link_resolved_target_path: 'pages/private.md' },
      },
      bundleNodeConfigs: configs,
      bundleConfig,
      routeTable: new Map(),
    });

    expect(rewritten).toBe('<a href="https://example.com">External</a><a href="#" data-meadow-link-not-tracked="true">Private</a>');
  });

  it('rewrites SVG shape links while preserving document-local references', () => {
    const content = '<svg><a href="../Home.md"><circle r="10"/></a><use href="#petal"/></svg>';
    const rewritten = rewriteNativeHtmlUrls({
      content,
      currentOutputDirectory: 'images',
      linkResolutionMap: {
        '../Home.md': { link_resolved_target_directory: '', link_resolved_target_path: 'Home.md' },
      },
      bundleNodeConfigs: configs,
      bundleConfig,
      routeTable: new Map([['aaaaaaaaaaaa', 'Home.html']]),
    });

    expect(rewritten).toBe('<svg><a href="../Home.html"><circle r="10"/></a><use href="#petal"/></svg>');
  });
});
