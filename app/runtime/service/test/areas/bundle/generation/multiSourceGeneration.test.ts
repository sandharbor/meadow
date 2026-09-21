/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BundleConfig } from '../../../../../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig, BundleNodeId } from '../../../../../../contracts/types/bundleNodeConfig.js';
import type { FileType } from '../../../../../../contracts/types/FileType.js';
import { BundleConfigPaths } from '../../../../../../shared_code/paths/bundleConfigPaths.js';
import { materializeSourceGraph } from '../../../../../../shared_code/shared_dev/sourceChanges.js';
import { stringifyBundleNodeConfig } from '../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { initializeSourcing, loadSourceBundleConfig, loadSourceNodeConfigs, snapshotSourceRoot } from '../../../../src/shared/source-snapshot/sourceSnapshots.js';
import { stageSourceRegistry } from '../../../../src/areas/bundle/sourcing/services/sourceRegistryReview.js';
import { sourcingReview, acceptSourceSnapshot } from '../../../../src/areas/bundle/sourcing/services/sourceReview.js';
import { ensureTrackedPageContent } from '../../../../src/areas/bundle/generation/source-material/trackedPageContent.js';
import { generateHtmlForBundle } from '../../../../src/areas/bundle/generation/html/htmlService.js';
import { runGenerationWorkingGraph } from '../../../../src/areas/bundle/generation/source-material/generationWorkingGraph.js';
import { buildFilteredOpenKnowledgeFormatForBundle } from '../../../../src/areas/bundle/generation/open-knowledge-format/filteredOpenKnowledgeFormat.js';
import { getOpenKnowledgeFormatLogPageOptions } from '../../../../src/areas/bundle/generation/open-knowledge-format/openKnowledgeFormatLogPages.js';
import { buildFilteredSourcesExportForBundle } from '../../../../src/areas/bundle/generation/sources-export/filteredSourcesExport.js';
import { getGeneratedBundleTestOutputDirectory } from '../../../shared/support/generatedBundleTestOutput.js';

vi.mock('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js', async importOriginal => ({ ...await importOriginal<typeof import('../../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js')>(), commitChangesNative: vi.fn(async () => undefined) }));
const projectRoot = fileURLToPath(new URL('../../../../../../../', import.meta.url));
let temporary: string;
let bundle: string;
let graph: string;
let config: BundleConfig;
let nodes: BundleNodeConfig[];
let priorHome: string | undefined;

beforeEach(() => {
  temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-multi-source-generation-')));
  priorHome = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = temporary;
  graph = materializeSourceGraph({ projectRoot, sourceGraphsDir: path.join(temporary, 'source_graphs'), sourceGraph: 'multi-source' });
  bundle = path.join(temporary, 'bundles/multi-source');
  fs.cpSync(path.join(projectRoot, 'app/shared_data/home_fixtures/home_fixture_big_and_small/bundles/meadow-test-bundle-big/config'), path.join(bundle, 'config'), { recursive: true });
  const legacy = YAML.parse(fs.readFileSync(BundleConfigPaths.getBundleConfigFile(bundle), 'utf8')) as BundleConfig;
  delete legacy.sourceDirectory;
  config = { ...legacy, publishSlug: 'multi-source', sources: ['notes', 'research', 'reference'].map((name, index) => ({
    id: `source00000${index + 1}`, name, directory: path.join(graph, name), ...(name === 'research' && { aliases: ['papers'] }),
  })), defaultOutlinksDepth: 2, defaultInlinksDepth: 1, sourceOutputLayout: 'multi', generationMarkdownZipEnabled: true, generationTagsEnabled: false };
  nodes = config.sources!.flatMap(source => fs.readdirSync(source.directory, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => {
    const relative = path.relative(source.directory, path.join(entry.parentPath, entry.name));
    const extension = path.extname(relative);
    return { sourceId: source.id, bundleNodeName: path.basename(relative, extension), sourceGraphSubdirectory: path.dirname(relative) === '.' ? '' : path.dirname(relative),
      bundleNodeKind: 'file' as const, fileType: extension.slice(1) as FileType, bundleNodeId: createHash('sha256').update(`${source.id}/${relative}`).digest('hex').slice(0, 12) as BundleNodeId, listType: 'whitelist' as const };
  }));
  config.entryBundleNodeId = nodes.find(node => node.bundleNodeName === 'Start')!.bundleNodeId;
  config.defaultTraversalBundleNodeId = config.entryBundleNodeId;
});

afterEach(({ task }) => {
  if (priorHome === undefined) delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  else process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = priorHome;
  if (task.result?.state === 'fail') console.error(`Multi-source generation retained at ${temporary}`);
  else fs.rmSync(temporary, { recursive: true, force: true });
});

async function generate(options: Parameters<typeof generateHtmlForBundle>[1] = {}): Promise<string> {
  fs.writeFileSync(BundleConfigPaths.getBundleConfigFile(bundle), YAML.stringify(config));
  fs.writeFileSync(BundleConfigPaths.getBundleNodeConfigFile(bundle), stringifyBundleNodeConfig(nodes));
  const state = await initializeSourcing(bundle);
  await ensureTrackedPageContent(bundle, snapshotSourceRoot(bundle, state.acceptedId));
  const output = getGeneratedBundleTestOutputDirectory(bundle);
  await generateHtmlForBundle(bundle, { ...options, preview: true, outputDirectory: output });
  return output;
}

it('publishes namesake pages and assets separately and rewrites links using source identity', async () => {
  fs.appendFileSync(path.join(graph, 'notes/Start.md'), '\n[[Report.html::research#findings|findings]]\n\n![[Overview::papers#Research overview]]\n');
  const output = await generate();
  const generatedGraph = JSON.parse(await runGenerationWorkingGraph({ graphRoot: BundleConfigPaths.getScrubbedSourceContentDir(bundle),
    bundleNodeConfigPath: BundleConfigPaths.getPreparedBundleNodeConfigFile(bundle), entryBundleNodeId: config.entryBundleNodeId!,
    defaultTraversalBundleNodeId: config.defaultTraversalBundleNodeId!, defaultOutlinksDepth: 2, defaultInlinksDepth: 1,
    frontierDepth: 0, allowImagesToExtendToFrontier: true, allowLowerDepths: false }, config));
  expect(generatedGraph.allLinkResolutionMaps['sources/notes/diagram.svg']).toEqual({ 'source://notes/Overview.md': {
    link_resolved_target_directory: 'sources/notes', link_resolved_target_path: 'sources/notes/Overview.md',
  } });
  const read = (relative: string) => fs.readFileSync(path.join(output, relative), 'utf8');
  expect(read('sources/notes/Overview.html')).toContain('Notebook overview');
  expect(read('sources/research/Overview.html')).toContain('Research overview');
  const start = read('sources/notes/Start.html');
  expect(start).toContain('href="Overview.html"');
  expect(start).toContain('href="../research/Overview.html"');
  expect(start).toContain('href="../research/Report.html');
  expect(start).toContain('href="../research/Report.html#findings">findings');
  expect(start).toContain('research; they do not select the notebook');
  expect(read('sources/notes/diagram.svg')).toContain('Overview.html');
  expect(read('sources/research/diagram.svg')).toContain('../notes/Overview.html');
  expect(read('sources/research/Report.html')).toContain('../notes/Overview.html');
  expect(start).not.toContain('_mw_sources');
  expect(fs.existsSync(path.join(output, 'sources/notes/Unrelated.html'))).toBe(false);
  expect(fs.existsSync(path.join(BundleConfigPaths.getTrackedPageContentDir(bundle), '_mw_sources/source000001/Overview.md'))).toBe(true);
  const routeDir = path.join(output, '_mw_assets/versioning');
  const routes = JSON.parse(fs.readFileSync(path.join(routeDir, fs.readdirSync(routeDir).find(file => /^routes\..*\.json$/.test(file))!), 'utf8'));
  expect(routes.routesByBundleNodeId[nodes.find(node => node.sourceId === 'source000002' && node.bundleNodeName === 'Overview')!.bundleNodeId]).toBe('sources/research/Overview.html');
});

it('exports source-qualified Markdown, HTML, and SVG as portable source downloads', async () => {
  await generate();
  expect(fs.existsSync(path.join(BundleConfigPaths.getSourcesExportDir(bundle), 'sources/research/Overview.md'))).toBe(true);
  const download = (relative: string) => fs.readFileSync(path.join(BundleConfigPaths.getSourcesExportDir(bundle), relative), 'utf8');
  expect(download('sources/notes/Start.md')).toContain('[[sources/research/Overview.md|research overview]]');
  expect(download('sources/notes/Start.md')).toContain('(../research/Report.html#findings)');
  expect(download('sources/research/Report.html')).toContain('../notes/Overview.md');
  expect(download('sources/research/diagram.svg')).toContain('../notes/Overview.md');
  await buildFilteredSourcesExportForBundle(bundle);
  expect(download('sources/notes/Start.md')).toContain('[[sources/research/Overview.md|research overview]]');
});

it('exports OKF paths and selects an index without confusing namesake pages', async () => {
  config.generationOpenKnowledgeFormatEnabled = true;
  await generate();
  const okf = BundleConfigPaths.getOpenKnowledgeFormatDir(bundle);
  expect(fs.readFileSync(path.join(okf, 'sources/notes/Start.md'), 'utf8')).toContain('(/sources/research/Overview.md)');
  expect(fs.readFileSync(path.join(okf, 'sources/research/Report.html'), 'utf8')).toContain('/sources/notes/Overview.md');
  const options = await getOpenKnowledgeFormatLogPageOptions(bundle, { query: 'Overview' });
  expect(options.pages.map(page => page.fullPath)).toEqual(expect.arrayContaining(['_mw_sources/source000001/Overview.md', '_mw_sources/source000002/Overview.md']));
  config.generationOpenKnowledgeFormatIndexMode = 'trackedPage';
  config.generationOpenKnowledgeFormatIndexSourcePath = '_mw_sources/source000002/Overview.md';
  fs.writeFileSync(BundleConfigPaths.getBundleConfigFile(bundle), YAML.stringify(config));
  await buildFilteredOpenKnowledgeFormatForBundle(bundle);
  expect(fs.readFileSync(path.join(okf, 'index.md'), 'utf8')).toContain('Research overview');
});

it('previews the selected source when two pages share a filename', async () => {
  let previewPath: string | undefined;
  await generate({ startPage: { title: 'Overview', directory: '', sourceId: 'source000002' },
    onStartPageRendered: ({ relativeHtmlPath }) => { previewPath = relativeHtmlPath; } });
  expect(previewPath).toBe('sources/research/Overview.html');
});

it.each([false, true])('retains the selected layout for a single registered source (multi=%s)', async (multi) => {
  config.sources = config.sources!.slice(0, 1);
  nodes = nodes.filter(node => node.sourceId === 'source000001');
  if (!multi) delete config.sourceOutputLayout;
  const output = await generate();
  const prefix = multi ? 'sources/notes/' : '';
  const html = fs.readFileSync(path.join(output, `${prefix}Start.html`), 'utf8');
  expect(html).toContain('href="Overview.html"');
  expect(html).not.toContain('research/Overview.html');
  expect(fs.readFileSync(path.join(output, `${prefix}Overview.html`), 'utf8')).toContain('Notebook overview');
});

it('generates an ordered collection of a page and another source folder', async () => {
  const original = nodes.find(node => node.bundleNodeId === config.entryBundleNodeId)!;
  nodes = [original,
    { bundleNodeKind: 'folder', sourceId: 'source000002', sourceGraphSubdirectory: '', bundleNodeName: 'Research', bundleNodeId: 'folder000001' as BundleNodeId, listType: 'whitelist' },
    { bundleNodeKind: 'collection', bundleNodeName: 'Mixed starts', bundleNodeId: 'collect00001' as BundleNodeId, listType: 'whitelist', memberBundleNodeIds: [original.bundleNodeId, 'folder000001' as BundleNodeId] },
  ];
  config.entryBundleNodeId = 'collect00001' as BundleNodeId;
  config.defaultTraversalBundleNodeId = config.entryBundleNodeId;
  const output = await generate();
  const index = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  expect(index).toContain('sources/notes/Start.html');
  expect(index).toContain('structural-child-name">research');
  expect(index.indexOf('structural-child-name">Start')).toBeLessThan(index.indexOf('structural-child-name">research'));
  expect(fs.readFileSync(path.join(output, 'sources/research/Same/Inside.html'), 'utf8')).toContain('Overview.html');
  expect(fs.readFileSync(BundleConfigPaths.getBundleNodeConfigFile(bundle), 'utf8')).toContain(original.bundleNodeId);
});

it('shares generated tag navigation across sources while leaving original bytes untouched', async () => {
  config.generationTagsEnabled = true;
  for (const name of ['notes', 'research']) fs.appendFileSync(path.join(graph, name, 'Overview.md'), '\n#shared\n');
  const output = await generate();
  for (const name of ['notes', 'research']) {
    const html = fs.readFileSync(path.join(output, `sources/${name}/Overview.html`), 'utf8');
    expect(html).toContain('../../_mw_gen/tagpages/tag--shared.html');
    expect(fs.readFileSync(path.join(graph, name, 'Overview.md'), 'utf8')).toContain('#shared');
  }
  const tag = fs.readFileSync(path.join(output, '_mw_gen/tagpages/tag--shared.html'), 'utf8');
  expect(tag).toContain('sources/notes/Overview.html');
  expect(tag).toContain('sources/research/Overview.html');
});

it('preserves page IDs across renamed output routes and generates while the live source is disconnected', async () => {
  config.generationSpacedRepetitionEnabled = true;
  config.generationSpacedRepetitionTags = ['#srs'];
  config.generationTagsEnabled = true;
  fs.appendFileSync(path.join(graph, 'research/Overview.md'), '\n#srs\n\nWhich [[Overview::papers]]?::Research\n');
  const first = await generate();
  const previous = path.join(path.dirname(first), 'vOlder1');
  fs.cpSync(first, previous, { recursive: true });
  const priorPage = fs.readFileSync(path.join(previous, 'sources/research/Overview.html'), 'utf8');
  const priorCards = JSON.parse(fs.readFileSync(path.join(previous, '_mw_assets/cust/srs/srs-all-cards.json'), 'utf8')).cards;
  expect(priorCards).toHaveLength(1);
  expect(priorCards[0].pageId).toBe('sources/research/Overview.html');
  const identity = nodes.find(node => node.sourceId === 'source000002' && node.bundleNodeName === 'Overview')!.bundleNodeId;
  await stageSourceRegistry(bundle, config.sources!.map(source => source.name === 'research' ? { ...source, name: 'library' } : source));
  const review = await sourcingReview(bundle);
  await acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken, resolutions: {}, trackNewPages: false });
  config = loadSourceBundleConfig(bundle);
  nodes = loadSourceNodeConfigs(bundle);
  fs.renameSync(path.join(graph, 'research'), path.join(graph, 'disconnected-research'));
  const output = await generate();
  const updated = fs.readFileSync(path.join(output, 'sources/library/Overview.html'), 'utf8');
  expect(updated).toContain(`name="meadow-bundle-node-id" content="${identity}"`);
  expect(fs.readFileSync(path.join(output, 'sources/notes/Start.html'), 'utf8')).toContain('../library/Overview.html');
  expect(fs.existsSync(path.join(output, 'sources/research/Overview.html'))).toBe(false);
  expect(fs.readFileSync(path.join(previous, 'sources/research/Overview.html'), 'utf8')).toBe(priorPage);
  const routeDir = path.join(output, '_mw_assets/versioning');
  const routes = JSON.parse(fs.readFileSync(path.join(routeDir, fs.readdirSync(routeDir).find(file => /^routes\..*\.json$/.test(file))!), 'utf8'));
  expect(routes.routesByBundleNodeId[identity]).toBe('sources/library/Overview.html');
  const nextCards = JSON.parse(fs.readFileSync(path.join(output, '_mw_assets/cust/srs/srs-all-cards.json'), 'utf8')).cards;
  expect(nextCards[0]).toMatchObject({ guid: priorCards[0].guid, pageId: 'sources/library/Overview.html' });
});
