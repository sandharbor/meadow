/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BundleConfig } from '../../../../../../../contracts/types/shared/bundle-config/bundleConfig.js';
import type { BundleNodeConfig, BundleNodeId } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { stringifyBundleNodeConfig } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { sourceGraphPath } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';
import { initializeSourcing, snapshotSourceRoot } from '../../../../../src/shared/source-snapshot/sourceSnapshots.js';
import { ensureTrackedPageContent } from '../../../../../src/areas/bundle/generation/source-material/trackedPageContent.js';
import { generateHtmlForBundle } from '../../../../../src/areas/bundle/generation/html/htmlService.js';
import { getGeneratedBundleTestOutputDirectory } from '../../../../shared/support/generatedBundleTestOutput.js';

vi.mock('../../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js', async importOriginal => ({ ...await importOriginal<typeof import('../../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js')>(), commitChangesNative: vi.fn(async () => undefined) }));
const projectRoot = fileURLToPath(new URL('../../../../../../../../', import.meta.url));
// An Excalidraw drawing saved as plain Markdown, which Obsidian allows: the
// frontmatter, not the file name, makes it a drawing.
const drawing = fs.readFileSync(path.join(projectRoot,
  'app/shared_data/source_graphs/meadow-test-bundles-data/t006 - second directory/embedded in page in other t006 directory.md'), 'utf8');
let temporary: string;
let bundle: string;
let priorHome: string | undefined;

beforeEach(() => {
  temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-plain-markdown-drawing-')));
  priorHome = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = temporary;
  bundle = path.join(temporary, 'bundles/drawings');
  fs.cpSync(path.join(projectRoot, 'app/shared_data/home_fixtures/home_fixture_big_and_small/bundles/meadow-test-bundle-big/config'), path.join(bundle, 'config'), { recursive: true });
});

afterEach(() => {
  if (priorHome === undefined) delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  else process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = priorHome;
  fs.rmSync(temporary, { recursive: true, force: true });
});

it('publishes a drawing saved as plain Markdown that a page embeds and links without an extension', async () => {
  const graph = path.join(temporary, 'source_graphs/notes');
  fs.mkdirSync(path.join(graph, 'drawings'), { recursive: true });
  fs.writeFileSync(path.join(graph, 'Start.md'), 'A drawing:\n\n![[Sketch|300]]\n\nAnd a link to it: [[Sketch]]\n');
  fs.writeFileSync(path.join(graph, 'drawings/Sketch.md'), drawing);
  const nodes: BundleNodeConfig[] = [
    { sourceId: 'source000001', bundleNodeName: 'Start', sourceGraphSubdirectory: '', bundleNodeKind: 'file', fileType: 'md', bundleNodeId: 'aaaaaaaaaaaa' as BundleNodeId, listType: 'whitelist' },
    { sourceId: 'source000001', bundleNodeName: 'Sketch', sourceGraphSubdirectory: 'drawings', bundleNodeKind: 'file', fileType: 'excalidraw', bundleNodeId: 'bbbbbbbbbbbb' as BundleNodeId, listType: 'whitelist' },
  ];
  const legacy = YAML.parse(fs.readFileSync(BundleConfigPaths.getBundleConfigFile(bundle), 'utf8')) as BundleConfig;
  delete legacy.sourceDirectory;
  const config: BundleConfig = { ...legacy, publishSlug: 'drawings', sources: [{ id: 'source000001', name: 'notes', directory: graph }],
    entryBundleNodeId: 'aaaaaaaaaaaa' as BundleNodeId, defaultTraversalBundleNodeId: 'aaaaaaaaaaaa' as BundleNodeId, generationTagsEnabled: false };
  fs.writeFileSync(BundleConfigPaths.getBundleConfigFile(bundle), YAML.stringify(config));
  fs.writeFileSync(BundleConfigPaths.getBundleNodeConfigFile(bundle), stringifyBundleNodeConfig(nodes));

  const state = await initializeSourcing(bundle);
  await ensureTrackedPageContent(bundle, snapshotSourceRoot(bundle, state.acceptedId));
  const output = getGeneratedBundleTestOutputDirectory(bundle);
  await generateHtmlForBundle(bundle, { preview: true, outputDirectory: output });

  // The copy keeps the drawing's own name, so its links resolve as they do in the source.
  expect(fs.existsSync(path.join(BundleConfigPaths.getTrackedPageContentDir(bundle), sourceGraphPath('source000001', 'drawings'), 'Sketch.md'))).toBe(true);
  const start = fs.readFileSync(path.join(output, 'Start.html'), 'utf8');
  expect(start).not.toContain('link not tracked');
  // Both the embed and the link resolve to the drawing's page.
  expect(start.match(/href="drawings\/Sketch\.html"/g)).toHaveLength(2);
  // The embed shows the drawing; the plain link is a link, as in Obsidian.
  expect(start.match(/data-meadow-excalidraw-src="drawings\/Sketch\.excalidraw\.md"/g)).toHaveLength(1);
  expect(start).toContain('<a href="drawings/Sketch.html">Sketch</a>');
  // The drawing's page and the data its renderer fetches keep their published names.
  expect(fs.existsSync(path.join(output, 'drawings/Sketch.html'))).toBe(true);
  expect(fs.readFileSync(path.join(output, 'drawings/Sketch.excalidraw.md'), 'utf8')).toContain('excalidraw-plugin');
});
