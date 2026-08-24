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

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { BundleNodeId } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { GeneratedBundleReaderRouteIndex } from '../../../../../../../contracts/types/generatedBundleVersioning.js';
import type { BundleRouteTable } from '../html/bundleRoutePlanner.js';

const VERSIONING_ASSET_DIRECTORY = path.posix.join('_mw_assets', 'versioning');

export const VERSION_AWARENESS_CSS = `.meadow-version-awareness {
  box-sizing: border-box;
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid #9ab6d3;
  border-radius: 0.4rem;
  background: #eef6ff;
  color: #17324d;
  font: 0.95rem/1.4 system-ui, sans-serif;
}
.meadow-version-awareness--missing {
  border-color: #c88934;
  background: #fff5df;
  color: #55320d;
}
.meadow-version-awareness a {
  color: inherit;
  font-weight: 650;
  text-decoration: underline;
}
`;

export const VERSION_AWARENESS_JAVASCRIPT = `(() => {
  'use strict';
  const script = document.currentScript;
  if (!(script instanceof HTMLScriptElement) || !script.src || !/^https?:$/.test(location.protocol)) return;
  try {
    const scriptUrl = new URL(script.src, location.href);
    if (scriptUrl.origin !== location.origin) return;
    const versionRoot = new URL('../../', scriptUrl);
    const rootSegment = versionRoot.pathname.replace(/\\/$/, '').split('/').pop() || '';
    const match = rootSegment.match(/^(.*)-(v[A-Za-z0-9]{6})$/);
    if (!match) return;
    const destinationStem = match[1];
    const currentVersionId = match[2];
    const destinationParent = new URL('../', versionRoot);
    const manifestUrl = new URL(destinationStem + '-versions.json', destinationParent);
    const nodeId = document.querySelector('meta[name="meadow-bundle-node-id"]')?.getAttribute('content') || null;
    const currentPath = decodeURIComponent(location.pathname.slice(versionRoot.pathname.length));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const validRelativePath = value => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.split('/').includes('..');
    const getJson = async url => {
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!response.ok || !/^application\\/(?:json|[^;]+\\+json)(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('untrusted response');
      return response.json();
    };
    (async () => {
      try {
        const manifest = await getJson(manifestUrl);
        if (!manifest || manifest.schemaVersion !== 1 || typeof manifest.successors !== 'object') return;
        const successor = manifest.successors[currentVersionId];
        if (!successor || !validRelativePath(successor.versionRoot) || !validRelativePath(successor.routeIndex) || !validRelativePath(successor.entryPath)) return;
        const successorRoot = new URL(successor.versionRoot.replace(/\\/$/, '') + '/', destinationParent);
        if (successorRoot.origin !== location.origin) return;
        const routeIndex = await getJson(new URL(successor.routeIndex, successorRoot));
        if (!routeIndex || routeIndex.schemaVersion !== 1 || typeof routeIndex.routesByBundleNodeId !== 'object' || !Array.isArray(routeIndex.generatedPagePaths)) return;
        let equivalentPath = nodeId ? routeIndex.routesByBundleNodeId[nodeId] : null;
        if (!nodeId && routeIndex.generatedPagePaths.includes(currentPath)) equivalentPath = currentPath;
        if (equivalentPath && !validRelativePath(equivalentPath)) equivalentPath = null;
        const targetPath = equivalentPath || successor.entryPath;
        if (!validRelativePath(targetPath)) return;
        const callout = document.createElement('aside');
        callout.className = 'meadow-version-awareness' + (equivalentPath ? '' : ' meadow-version-awareness--missing');
        callout.setAttribute('role', 'status');
        const message = document.createElement('span');
        message.textContent = equivalentPath
          ? 'A newer version of this page is available. '
          : 'A newer version of this bundle is available, but this page is not included in it. ';
        const link = document.createElement('a');
        link.href = new URL(targetPath, successorRoot).href;
        link.textContent = 'Open the newer version.';
        callout.append(message, link);
        const content = document.querySelector('main') || document.body;
        content?.prepend(callout);
      } catch {
        // Reader awareness is optional and must never obstruct an older page.
      } finally {
        clearTimeout(timeout);
      }
    })();
  } catch {
    // Malformed page or asset URLs must also fail silently.
  }
})();
`;

function contentAddressedFilename(stem: string, extension: string, content: string | Buffer): string {
  const digest = createHash('sha256').update(content).digest('hex').slice(0, 12);
  return `${stem}.${digest}.${extension}`;
}

function collectGeneratedHtmlFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      if (relativePath === '_mw_assets' || relativePath.startsWith('_mw_assets/')) continue;
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(relativePath);
    }
  };
  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function injectAwarenessReferences(
  html: string,
  relativePath: string,
  bundleNodeId: string | null,
  javascriptFilename: string,
  cssFilename: string,
): string {
  const depth = path.posix.dirname(relativePath) === '.'
    ? 0
    : path.posix.dirname(relativePath).split('/').filter(Boolean).length;
  const prefix = '../'.repeat(depth);
  const metadata = [
    bundleNodeId
      ? `<meta name="meadow-bundle-node-id" content="${escapeHtmlAttribute(bundleNodeId)}">`
      : '',
    `<meta name="meadow-generated-path" content="${escapeHtmlAttribute(relativePath)}">`,
    `<link rel="stylesheet" href="${prefix}${VERSIONING_ASSET_DIRECTORY}/${cssFilename}">`,
    `<script src="${prefix}${VERSIONING_ASSET_DIRECTORY}/${javascriptFilename}" defer></script>`,
  ].filter(Boolean).join('\n    ');
  if (/<\/head\s*>/i.test(html)) return html.replace(/<\/head\s*>/i, `    ${metadata}\n</head>`);
  return html;
}

export interface VersionAwarenessAssetResult {
  javascriptPath: string;
  cssPath: string;
  routeIndexPath: string;
  routeIndex: GeneratedBundleReaderRouteIndex;
}

export function emitVersionAwarenessAssets(input: {
  outputDirectory: string;
  routeTable: BundleRouteTable;
  entryBundleNodeId: BundleNodeId;
}): VersionAwarenessAssetResult {
  const htmlFiles = collectGeneratedHtmlFiles(input.outputDirectory);
  const routeOwners = new Map<string, string>();
  for (const [bundleNodeId, route] of input.routeTable) {
    if (htmlFiles.includes(route)) routeOwners.set(route, bundleNodeId);
  }
  const routesByBundleNodeId = Object.fromEntries(
    [...routeOwners.entries()]
      .map(([route, bundleNodeId]) => [bundleNodeId, route] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const entryPath = input.routeTable.get(input.entryBundleNodeId);
  if (!entryPath || !htmlFiles.includes(entryPath)) throw new Error('Generated entry route is missing');
  const routeIndex: GeneratedBundleReaderRouteIndex = {
    schemaVersion: 1,
    entryPath,
    routesByBundleNodeId,
    generatedPagePaths: htmlFiles.filter((relativePath) => !routeOwners.has(relativePath)),
  };
  const routeIndexContent = `${JSON.stringify(routeIndex)}\n`;
  const javascriptFilename = contentAddressedFilename('version-awareness', 'js', VERSION_AWARENESS_JAVASCRIPT);
  const cssFilename = contentAddressedFilename('version-awareness', 'css', VERSION_AWARENESS_CSS);
  const routeIndexFilename = contentAddressedFilename('routes', 'json', routeIndexContent);
  const assetDirectory = path.join(input.outputDirectory, ...VERSIONING_ASSET_DIRECTORY.split('/'));
  fs.mkdirSync(assetDirectory, { recursive: true });
  fs.writeFileSync(path.join(assetDirectory, javascriptFilename), VERSION_AWARENESS_JAVASCRIPT, 'utf8');
  fs.writeFileSync(path.join(assetDirectory, cssFilename), VERSION_AWARENESS_CSS, 'utf8');
  fs.writeFileSync(path.join(assetDirectory, routeIndexFilename), routeIndexContent, 'utf8');

  for (const relativePath of htmlFiles) {
    const absolutePath = path.join(input.outputDirectory, ...relativePath.split('/'));
    const html = fs.readFileSync(absolutePath, 'utf8');
    fs.writeFileSync(
      absolutePath,
      injectAwarenessReferences(
        html,
        relativePath,
        routeOwners.get(relativePath) ?? null,
        javascriptFilename,
        cssFilename,
      ),
      'utf8',
    );
  }

  return {
    javascriptPath: `${VERSIONING_ASSET_DIRECTORY}/${javascriptFilename}`,
    cssPath: `${VERSIONING_ASSET_DIRECTORY}/${cssFilename}`,
    routeIndexPath: `${VERSIONING_ASSET_DIRECTORY}/${routeIndexFilename}`,
    routeIndex,
  };
}
