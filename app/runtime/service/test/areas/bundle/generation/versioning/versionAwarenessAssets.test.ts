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
import os from 'os';
import path from 'path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BundleNodeId } from '../../../../../../../shared_code/types/bundleNodeConfig.js';
import {
  emitVersionAwarenessAssets,
  VERSION_AWARENESS_JAVASCRIPT,
} from '../../../../../src/areas/bundle/generation/versioning/versionAwarenessAssets.js';

const nodeId = (value: string): BundleNodeId => value as BundleNodeId;

describe('version awareness assets', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-awareness-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const makeOutput = (name: string): string => {
    const output = path.join(root, name);
    fs.mkdirSync(path.join(output, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(output, 'index.html'), '<html><head></head><body><main>Entry</main></body></html>');
    fs.writeFileSync(path.join(output, 'nested', 'Café.html'), '<html><head></head><body><main>Moved</main></body></html>');
    fs.writeFileSync(path.join(output, 'generated.html'), '<html><head></head><body><main>Generated</main></body></html>');
    return output;
  };

  it('R06/R09 emits deterministic content-addressed reader-safe assets and page metadata', () => {
    const routes = new Map<BundleNodeId, string>([
      [nodeId('entry-node'), 'index.html'],
      [nodeId('stable-node'), 'nested/Café.html'],
    ]);
    const firstOutput = makeOutput('first');
    const secondOutput = makeOutput('second');

    const first = emitVersionAwarenessAssets({
      outputDirectory: firstOutput,
      routeTable: routes,
      entryBundleNodeId: nodeId('entry-node'),
    });
    const second = emitVersionAwarenessAssets({
      outputDirectory: secondOutput,
      routeTable: routes,
      entryBundleNodeId: nodeId('entry-node'),
    });

    expect(second).toEqual(first);
    expect(first.javascriptPath).toMatch(/^_mw_assets\/versioning\/version-awareness\.[a-f0-9]{12}\.js$/);
    expect(first.cssPath).toMatch(/^_mw_assets\/versioning\/version-awareness\.[a-f0-9]{12}\.css$/);
    expect(first.routeIndexPath).toMatch(/^_mw_assets\/versioning\/routes\.[a-f0-9]{12}\.json$/);
    expect(first.routeIndex).toEqual({
      schemaVersion: 1,
      entryPath: 'index.html',
      routesByBundleNodeId: {
        'entry-node': 'index.html',
        'stable-node': 'nested/Café.html',
      },
      generatedPagePaths: ['generated.html'],
    });

    const entryHtml = fs.readFileSync(path.join(firstOutput, 'index.html'), 'utf8');
    const nestedHtml = fs.readFileSync(path.join(firstOutput, 'nested', 'Café.html'), 'utf8');
    const generatedHtml = fs.readFileSync(path.join(firstOutput, 'generated.html'), 'utf8');
    expect(entryHtml).toContain('<meta name="meadow-bundle-node-id" content="entry-node">');
    expect(nestedHtml).toContain('<meta name="meadow-generated-path" content="nested/Café.html">');
    expect(nestedHtml).toContain('../_mw_assets/versioning/version-awareness.');
    expect(generatedHtml).not.toContain('meadow-bundle-node-id');

    const readerFiles = [first.javascriptPath, first.cssPath, first.routeIndexPath]
      .map(relativePath => fs.readFileSync(path.join(firstOutput, ...relativePath.split('/')), 'utf8'))
      .join('\n');
    expect(readerFiles).not.toContain('private source path');
    expect(readerFiles).not.toContain('providerInstanceId');
    expect(readerFiles).not.toContain('notes');
  });

  interface RuntimeResult {
    callout: RuntimeElement | null;
    fetches: Array<{ url: string; options: Record<string, unknown> }>;
  }

  interface RuntimeElement {
    className: string;
    href?: string;
    textContent: string;
    children: RuntimeElement[];
    attributes: Record<string, string>;
    setAttribute(name: string, value: string): void;
    append(...children: RuntimeElement[]): void;
  }

  async function runAwareness(input: {
    nodeId?: string;
    pagePath?: string;
    manifest?: unknown;
    routeIndex?: unknown;
    failFetch?: boolean;
    protocol?: 'https:' | 'file:';
  }): Promise<RuntimeResult> {
    class FakeScriptElement {
      src = 'https://example.test/package-vAb1234/_mw_assets/versioning/version-awareness.hash.js';
    }
    const makeElement = (): RuntimeElement => ({
      className: '',
      textContent: '',
      children: [],
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      append(...children) { this.children.push(...children); },
    });
    let callout: RuntimeElement | null = null;
    const main = makeElement();
    (main as RuntimeElement & { prepend: (element: RuntimeElement) => void }).prepend = element => { callout = element; };
    const fetches: RuntimeResult['fetches'] = [];
    let fetchNumber = 0;
    const jsonResponse = (value: unknown) => ({
      ok: true,
      headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      json: async () => value,
    });
    const pagePath = input.pagePath ?? 'guides/old.html';
    const protocol = input.protocol ?? 'https:';
    const locationHref = protocol === 'https:'
      ? `https://example.test/package-vAb1234/${pagePath}`
      : `file:///tmp/package-vAb1234/${pagePath}`;
    const context = vm.createContext({
      URL,
      AbortController,
      HTMLScriptElement: FakeScriptElement,
      location: {
        protocol,
        origin: protocol === 'https:' ? 'https://example.test' : 'null',
        href: locationHref,
        pathname: new URL(locationHref).pathname,
      },
      document: {
        currentScript: new FakeScriptElement(),
        body: makeElement(),
        querySelector: (selector: string) => {
          if (selector === 'meta[name="meadow-bundle-node-id"]') {
            return input.nodeId ? { getAttribute: () => input.nodeId } : null;
          }
          return selector === 'main' ? main : null;
        },
        createElement: () => makeElement(),
      },
      fetch: async (url: URL, options: Record<string, unknown>) => {
        fetches.push({ url: String(url), options });
        if (input.failFetch) throw new Error('offline');
        return jsonResponse(fetchNumber++ === 0 ? input.manifest : input.routeIndex);
      },
      setTimeout,
      clearTimeout,
    });
    vm.runInContext(VERSION_AWARENESS_JAVASCRIPT, context);
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    return { callout, fetches };
  }

  const successorManifest = {
    schemaVersion: 1,
    successors: {
      vAb1234: {
        versionId: 'vCd5678',
        versionRoot: 'package-vCd5678',
        routeIndex: '_mw_assets/versioning/routes.hash.json',
        entryPath: 'index.html',
      },
    },
  };

  it('R06 routes stable identity to a moved successor page', async () => {
    const result = await runAwareness({
      nodeId: 'stable-node',
      manifest: successorManifest,
      routeIndex: {
        schemaVersion: 1,
        entryPath: 'index.html',
        routesByBundleNodeId: { 'stable-node': 'renamed/new.html' },
        generatedPagePaths: [],
      },
    });
    expect(result.callout?.className).toBe('meadow-version-awareness');
    expect(result.callout?.children[0].textContent).toContain('newer version of this page');
    expect(result.callout?.children[1].href).toBe('https://example.test/package-vCd5678/renamed/new.html');
    expect(result.fetches[0].options).toMatchObject({ cache: 'no-store', credentials: 'omit' });
  });

  it('R07 routes a missing or identity-less moved page only to the successor entry', async () => {
    const result = await runAwareness({
      manifest: successorManifest,
      routeIndex: {
        schemaVersion: 1,
        entryPath: 'index.html',
        routesByBundleNodeId: {},
        generatedPagePaths: ['another-generated.html'],
      },
    });
    expect(result.callout?.className).toContain('meadow-version-awareness--missing');
    expect(result.callout?.children[0].textContent).toContain('this page is not included');
    expect(result.callout?.children[1].href).toBe('https://example.test/package-vCd5678/index.html');
  });

  it('R08 is silent without a successor, for invalid responses, on network failure, and on file URLs', async () => {
    const cases = [
      { manifest: { schemaVersion: 1, successors: {} } },
      { manifest: { schemaVersion: 2, successors: {} } },
      { manifest: successorManifest, failFetch: true },
      { manifest: successorManifest, protocol: 'file:' as const },
    ];
    for (const testCase of cases) {
      const result = await runAwareness(testCase);
      expect(result.callout).toBeNull();
    }
  });
});
