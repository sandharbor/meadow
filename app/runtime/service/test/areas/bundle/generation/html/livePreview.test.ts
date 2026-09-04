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
import { execFileSync } from 'child_process';
import type { Server } from 'http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import generationRoutes, { type PreviewProgress } from '../../../../../src/areas/bundle/generation/routes/bundleGenerationRoutes.js';
import reviewRoutes from '../../../../../src/areas/bundle/review/routes/reviewRoutes.js';
import { generateHtmlForBundle } from '../../../../../src/areas/bundle/generation/html/htmlService.js';
import { generateCurrentBundleVersion } from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';
import { currentGeneratedBundleVersionDirectory } from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';

vi.mock('../../../../../src/areas/bundle/generation/html/htmlService.js', () => ({ generateHtmlForBundle: vi.fn() }));
vi.mock('../../../../../src/shared/bundle-boundary-review/bundleBoundaryReviewService.js', () => ({
  assessBundleBoundary: vi.fn(async () => ({ reviewRequired: false })),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function* progressEvents(response: Response): AsyncGenerator<PreviewProgress> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      pending += decoder.decode(value, { stream: true });
      let separator: number;
      while ((separator = pending.indexOf('\n\n')) !== -1) {
        const event = pending.slice(0, separator);
        pending = pending.slice(separator + 2);
        if (event.startsWith('data: ')) yield JSON.parse(event.slice(6)) as PreviewProgress;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

describe('live preview during atomic version generation', () => {
  let home: string;
  let bundleDirectory: string;
  let server: Server;
  let origin: string;
  let finish: ReturnType<typeof deferred>;
  let failRender: boolean;
  const selectedPage = 'nested/Selected page.html';

  beforeEach(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-live-preview-'));
    bundleDirectory = path.join(home, 'bundles', 'example');
    fs.mkdirSync(path.join(bundleDirectory, 'config'), { recursive: true });
    fs.writeFileSync(path.join(bundleDirectory, 'config', 'bundle_config.yaml'), 'bundleGuid: abc1234\n');
    execFileSync('git', ['init', '-b', 'main'], { cwd: home });
    vi.stubEnv('MEADOW_HOME_DIRECTORY_OVERRIDE', home);
    vi.stubEnv('MEADOW_API_CAPABILITY', 'test-preview-capability');
    finish = deferred();
    failRender = false;
    vi.mocked(generateHtmlForBundle).mockImplementation(async (_directory, options) => {
      fs.mkdirSync(path.join(options.outputDirectory, 'nested'), { recursive: true });
      fs.mkdirSync(path.join(options.outputDirectory, '_mw_assets'), { recursive: true });
      fs.writeFileSync(path.join(options.outputDirectory, selectedPage), '<h1>New selected page</h1>');
      fs.writeFileSync(path.join(options.outputDirectory, '_mw_assets', 'style.css'), 'h1 { color: blue; }');
      options.onStartPageRendered?.({ title: 'Selected page', directory: 'nested', relativeHtmlPath: selectedPage });
      options.onProgress?.({ stage: 'rendering-pages', message: 'Rendering pages', current: 1, total: 1000, percent: 0 });
      await finish.promise;
      if (failRender) throw new Error('Injected failure after the selected page rendered');
      fs.writeFileSync(path.join(options.outputDirectory, 'Last page.html'), '<h1>Last page</h1>');
    });
    const app = express();
    app.use('/api', generationRoutes, reviewRoutes);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Server did not bind');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    finish.resolve();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    vi.unstubAllEnvs();
    fs.rmSync(home, { recursive: true, force: true });
  });

  async function openPreview() {
    const response = await fetch(`${origin}/api/bundles/example/generation/preview-stream?startPagePath=${encodeURIComponent(selectedPage)}`);
    const events = progressEvents(response);
    let event: PreviewProgress;
    do {
      const next = await events.next();
      if (next.done) throw new Error('Preview ended before its first page');
      event = next.value;
    } while (!event.result?.traversalPageUrl && event.stage !== 'error');
    expect(event.stage).toBe('generating');
    return { events, url: event.result!.traversalPageUrl! };
  }

  it('serves the selected page and assets before the first version is installed, then preserves the selected URL', async () => {
    const { events, url } = await openPreview();
    expect(currentGeneratedBundleVersionDirectory(bundleDirectory)).toBeNull();
    expect(await (await fetch(url)).text()).toContain('New selected page');
    const asset = await fetch(`${origin}/api/bundles/example/generation/published/_mw_assets/style.css`);
    expect(await asset.text()).toContain('color: blue');
    expect(asset.headers.get('cache-control')).toBe('no-store');
    const pending = await fetch(`${origin}/api/bundles/example/generation/published/Last%20page.html`);
    expect(await pending.text()).toContain('Generating Preview');
    finish.resolve();
    const remaining: PreviewProgress[] = [];
    for await (const event of events) remaining.push(event);
    expect(remaining.at(-1)).toMatchObject({ stage: 'complete', result: { traversalPageUrl: url } });
    expect(currentGeneratedBundleVersionDirectory(bundleDirectory)).not.toBeNull();
    expect(await (await fetch(url)).text()).toContain('New selected page');
  });

  it.each([false, true])('refreshes Changes before completion and restores installed reads after failure=%s', async failure => {
    const installed = await generateCurrentBundleVersion(bundleDirectory, {
      generate: async directory => {
        fs.mkdirSync(path.join(directory, 'nested'), { recursive: true });
        fs.writeFileSync(path.join(directory, selectedPage), '<h1>Saved page</h1>');
      },
    });
    failRender = failure;
    const { events, url } = await openPreview();
    expect(fs.readFileSync(path.join(installed.directory, selectedPage), 'utf8')).toContain('Saved page');
    expect(await (await fetch(url)).text()).toContain('New selected page');
    const contentUrl = `${origin}/api/bundles/example/review/file-content?path=${encodeURIComponent(path.join(installed.directory, selectedPage))}`;
    expect((await (await fetch(contentUrl)).json()).content).toContain('New selected page');
    finish.resolve();
    const remaining: PreviewProgress[] = [];
    for await (const event of events) remaining.push(event);
    expect(remaining.at(-1)?.stage).toBe(failure ? 'error' : 'complete');
    const expected = failure ? 'Saved page' : 'New selected page';
    expect(await (await fetch(url)).text()).toContain(expected);
    expect((await (await fetch(contentUrl)).json()).content).toContain(expected);
  });
});
