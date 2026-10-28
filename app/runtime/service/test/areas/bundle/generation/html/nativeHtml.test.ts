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
import type { BundleConfig } from '../../../../../../../contracts/types/shared/bundle-config/bundleConfig.js';
import type { BundleNodeConfig } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
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

  it('links to a media page while the player fetches the original file', () => {
    const media: BundleNodeConfig = { bundleNodeKind: 'file', bundleNodeName: 'clip', fileType: 'mp4',
      sourceGraphSubdirectory: 'media', bundleNodeId: 'dddddddddddd', listType: 'whitelist' };
    const rewritten = rewriteNativeHtmlUrls({
      content: '<a href="media/clip.mp4">Clip</a><video src="media/clip.mp4"></video>',
      currentOutputDirectory: '', bundleNodeConfigs: [...configs, media], bundleConfig,
      linkResolutionMap: { 'media/clip.mp4': { link_resolved_target_directory: 'media', link_resolved_target_path: 'media/clip.mp4' } },
      routeTable: new Map([['dddddddddddd', 'media/clip.mp4.html']]),
    });
    expect(rewritten).toBe('<a href="media/clip.mp4.html">Clip</a><video src="media/clip.mp4"></video>');
  });

  it('preserves SVG image and use asset references while routing navigation anchors', () => {
    const image: BundleNodeConfig = { bundleNodeKind: 'file', bundleNodeName: 'photo', fileType: 'png',
      bundleNodeId: 'eeeeeeeeeeee', listType: 'whitelist' };
    const svg: BundleNodeConfig = { ...image, bundleNodeName: 'icon', fileType: 'svg', bundleNodeId: 'ffffffffffff' };
    const rewritten = rewriteNativeHtmlUrls({
      content: '<svg><a href="photo.png">Photo</a><image href="photo.png"/><use href="icon.svg"/></svg>',
      currentOutputDirectory: '', bundleNodeConfigs: [...configs, image, svg], bundleConfig,
      linkResolutionMap: {
        'photo.png': { link_resolved_target_directory: '', link_resolved_target_path: 'photo.png' },
        'icon.svg': { link_resolved_target_directory: '', link_resolved_target_path: 'icon.svg' },
      },
      routeTable: new Map([['eeeeeeeeeeee', 'photo.png.html'], ['ffffffffffff', 'icon.svg.html']]),
    });
    expect(rewritten).toBe('<svg><a href="photo.png.html">Photo</a><image href="photo.png"/><use href="icon.svg"/></svg>');
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
