/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setTimeout } from 'node:timers/promises';
import { reconcileCommandFilters, commandFilterConfigurationEpoch, controlCommandFilter, stopCommandFilter, stopCommandFilterProcesses } from '../../../src/shared/custom-filters/commandFilterEvaluation.js';
import { Graph } from '../../../../../contracts/types/shared/bundle-graph/graph.js';
import type { IBundleNode } from '../../../../../contracts/types/shared/bundle-graph/IBundleNode.js';
import type { CustomFilterConfig } from '../../../../../contracts/types/shared/curation/customFilters.js';
import { serializeBundleNodeKey, createFileNodeKey } from '../../../../../shared_code/utils/bundleNodeKey.js';
import { customFilterNodeMatch } from '../../../../../shared_code/utils/filterSelectors.js';
import { selectEffectivelySensitiveNodeKeys } from '../../../src/shared/bundle-graph/graphFilterService.js';

let home: string, directory: string, script: string;
let filter: CustomFilterConfig;
let nodes: IBundleNode[];
const reconcile = (context = 'accepted') => reconcileCommandFilters(directory, {}, nodes, [filter], context)[0];
async function terminal(context = 'accepted') {
  for (let attempt = 0; attempt < 200; attempt++) {
    const state = reconcile(context);
    if (state.status === 'completed' || state.status === 'failed') return state;
    await setTimeout(10);
  }
  throw new Error('Classifier did not finish');
}
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-command-filter-'));
  process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = home;
  directory = path.join(home, 'bundles', 'test');
  script = path.join(home, 'classifier.mjs');
  fs.writeFileSync(script, `let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input);process.stdout.write(JSON.stringify({version:1,results:request.nodes.map(node=>({id:node.id,selected:node.name==='private'}))}));`);
  filter = { id: 'command-test', name: 'Classifier', scope: 'bundle', selectors: [{ field: 'command', matchType: 'substring', value: '', command: { executable: process.execPath, args: [script], batchSize: 1, maxConcurrency: 2 } }], selectorApplicationCriteria: 'union', actions: [{ type: 'mark_sensitive' }], enabled: true, createdAt: '', updatedAt: '' };
  nodes = ['private', 'public', 'other'].map((name, index) => ({ bundleNodeKey: serializeBundleNodeKey(createFileNodeKey(`${name}.md`)), bundleNodeName: name, bundleNodeKind: 'file', fileType: 'md', sourceGraphSubdirectory: '', body: name, depth: index, remaining_depth: 0, label: name, getIdent: () => name }));
});
afterEach(async () => {
  stopCommandFilter(directory, filter.id); stopCommandFilterProcesses();
  await setTimeout(25);
  delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  fs.rmSync(home, { recursive: true, force: true });
});

describe('Command selector protocol and revisions', () => {
  it.each([
    ['missing', '{version:1,results:[]}'],
    ['duplicate', '{version:1,results:[{id:request.nodes[0].id,selected:true},{id:request.nodes[0].id,selected:false}]}'],
    ['unknown', '{version:1,results:[{id:"unknown",selected:true}]}'],
    ['non-boolean', '{version:1,results:[{id:request.nodes[0].id,selected:"yes"}]}'],
    ['version', '{version:2,results:[]}'],
  ])('rejects %s decisions without caching a negative result', async (_name, response) => {
    fs.writeFileSync(script, `let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input);process.stdout.write(JSON.stringify(${response}));`);
    const state = await terminal();
    expect(state.failed).toBe(3);
    expect(Object.values(state.nodes).every(node => node.state === 'failed' && node.selected === undefined)).toBe(true);
    expect(state.diagnostics).toHaveLength(3);
  });
  it('preserves known union/intersection answers and blocks unresolved sensitivity', async () => {
    reconcile();
    const graph = new Graph(); nodes.forEach(node => graph.addNode(node));
    const title = { field: 'title' as const, matchType: 'substring' as const, value: 'private' };
    expect(customFilterNodeMatch(nodes[0], [filter.selectors[0], title], 'union', graph, filter.id)).toBe(true);
    expect(customFilterNodeMatch(nodes[1], [filter.selectors[0], title], 'intersection', graph, filter.id)).toBe(false);
    expect(() => selectEffectivelySensitiveNodeKeys(graph, [filter])).toThrow('assessment is incomplete');
    await terminal();
    expect([...selectEffectivelySensitiveNodeKeys(graph, [filter])]).toEqual([nodes[0].bundleNodeKey]);
  });
  it('reuses persisted exact invocations in a fresh context and invalidates batch peers', async () => {
    filter.selectors[0].command!.batchSize = 2;
    await terminal();
    stopCommandFilter(directory, filter.id);
    expect(reconcile('reopened').cached).toBe(3);
    nodes[2].body = 'changed';
    const changed = reconcile('reopened');
    expect(changed.cached).toBe(1);
    await terminal('reopened');
  });
  it('does not let superseded in-flight results replace forced rerun results', async () => {
    fs.writeFileSync(script, `import fs from 'node:fs';import {setTimeout} from 'node:timers/promises';let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input);const old=!fs.existsSync(${JSON.stringify(path.join(home, 'new'))});if(old){fs.writeFileSync(${JSON.stringify(path.join(home, 'started'))},'');await setTimeout(200);}process.stdout.write(JSON.stringify({version:1,results:request.nodes.map(node=>({id:node.id,selected:old}))}));`);
    reconcile();
    await expect.poll(() => fs.existsSync(path.join(home, 'started'))).toBe(true);
    fs.writeFileSync(path.join(home, 'new'), '');
    controlCommandFilter(directory, filter.id, 'rerun');
    const state = await terminal();
    expect(Object.values(state.nodes).every(node => node.selected === false)).toBe(true);
    stopCommandFilter(directory, filter.id);
    expect(Object.values(reconcile().nodes).every(node => node.selected === false && node.cached)).toBe(true);
  });
});

it('deduplicates identical active evaluations across consumers and preserves concurrency while paused', async () => {
  fs.writeFileSync(script, `import fs from 'node:fs';import {setTimeout} from 'node:timers/promises';let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input);fs.writeFileSync(${JSON.stringify(home)}+'/started-'+process.pid,'');while(!fs.existsSync(${JSON.stringify(home)}+'/release'))await setTimeout(10);process.stdout.write(JSON.stringify({version:1,results:request.nodes.map(node=>({id:node.id,selected:false}))}));`);
  reconcile(); reconcile('proposal');
  await expect.poll(() => fs.readdirSync(home).filter(name => name.startsWith('started-')).length).toBe(2);
  expect(reconcile().running).toBe(2);
  controlCommandFilter(directory, filter.id, 'pause');
  fs.writeFileSync(path.join(home, 'release'), '');
  await expect.poll(() => reconcile().running).toBe(0);
  expect(reconcile()).toMatchObject({ paused: true, pending: 1, completed: 2 });
  stopCommandFilter(directory, filter.id);
  expect(reconcile()).toMatchObject({ paused: true, pending: 1, cached: 2 });
  controlCommandFilter(directory, filter.id, 'resume');
  expect((await terminal()).completed).toBe(3);
});

it('bounds unresponsive processes and distinguishes timeout from a negative decision', async () => {
  fs.writeFileSync(script, 'setInterval(()=>{},1000);');
  filter.selectors[0].command!.timeoutMs = 50;
  const state = await terminal();
  expect(state.failed).toBe(3);
  expect(state.diagnostics.every(item => item.message.includes('timed out'))).toBe(true);
  expect(Object.values(state.nodes).every(node => node.selected === undefined)).toBe(true);
});

it('lets frontier and base consumers finish without cancelling each other', async () => {
  const base = nodes;
  const expanded = [...nodes, { ...nodes[2], bundleNodeKey: serializeBundleNodeKey(createFileNodeKey('frontier.md')), bundleNodeName: 'frontier' }];
  for (let attempt = 0; attempt < 5; attempt++) {
    reconcileCommandFilters(directory, {}, base, [filter], 'base');
    reconcileCommandFilters(directory, {}, expanded, [filter], 'frontier');
    await setTimeout(10);
  }
  await expect.poll(() => [
    reconcileCommandFilters(directory, {}, base, [filter], 'base')[0].status,
    reconcileCommandFilters(directory, {}, expanded, [filter], 'frontier')[0].status,
  ]).toEqual(['completed', 'completed']);
});

it('caches obsolete exact inputs without allowing their decisions to overwrite current inputs', async () => {
  fs.writeFileSync(script, `import {setTimeout} from 'node:timers/promises';let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input);if(request.nodes.some(node=>node.content==='private'))await setTimeout(100);process.stdout.write(JSON.stringify({version:1,results:request.nodes.map(node=>({id:node.id,selected:node.content==='private'}))}));`);
  reconcile();
  nodes[0].body = 'changed';
  const current = await terminal();
  expect(current.nodes[nodes[0].bundleNodeKey].selected).toBe(false);
  await expect.poll(() => fs.readdirSync(path.join(home, 'cache/command-filters/v1')).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).length).toBe(5);
  nodes[0].body = 'private';
  const restored = reconcile('restored');
  expect(restored.nodes[nodes[0].bundleNodeKey]).toMatchObject({ selected: true, cached: true });
});

it('does not restart a filter from inputs captured before a disable/delete mutation', () => {
  const epoch = commandFilterConfigurationEpoch(directory);
  stopCommandFilter(directory, filter.id);
  expect(reconcileCommandFilters(directory, {}, nodes, [filter], 'stale', epoch)).toEqual([]);
});

it('ignores transient launch bookkeeping when reusing persisted command inputs', async () => {
  await terminal();
  const previous = process.env.TERM_SESSION_ID;
  process.env.TERM_SESSION_ID = 'a-different-launch';
  try {
    stopCommandFilter(directory, filter.id);
    expect(reconcile('new-launch').cached).toBe(3);
  } finally {
    if (previous === undefined) delete process.env.TERM_SESSION_ID; else process.env.TERM_SESSION_ID = previous;
  }
});

it('persists rerun invalidation for graph variants that were not loaded after a restart', async () => {
  const base = nodes;
  const expanded = [...nodes, { ...nodes[2], bundleNodeKey: serializeBundleNodeKey(createFileNodeKey('frontier.md')), bundleNodeName: 'frontier' }];
  await terminal('base');
  await expect.poll(() => reconcileCommandFilters(directory, {}, expanded, [filter], 'frontier')[0].status).toBe('completed');
  stopCommandFilter(directory, filter.id);
  expect(reconcileCommandFilters(directory, {}, base, [filter], 'base')[0].cached).toBe(3);
  controlCommandFilter(directory, filter.id, 'rerun');
  expect(reconcileCommandFilters(directory, {}, base, [filter], 'base')[0].cached).toBe(0);
  expect(reconcileCommandFilters(directory, {}, expanded, [filter], 'frontier')[0].cached).toBe(0);
  await expect.poll(() => reconcileCommandFilters(directory, {}, expanded, [filter], 'frontier')[0].status).toBe('completed');
});

it('keeps an unrelated bundle mutation from invalidating a captured graph epoch', () => {
  const other = path.join(home, 'bundles', 'other');
  const epoch = commandFilterConfigurationEpoch(other);
  stopCommandFilter(directory, filter.id);
  expect(commandFilterConfigurationEpoch(other)).toBe(epoch);
});

it('never sends live frontier text as captured classifier content', async () => {
  fs.writeFileSync(script, `let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input);process.stdout.write(JSON.stringify({version:1,results:request.nodes.map(node=>({id:node.id,selected:node.content===null}))}));`);
  nodes[0] = { ...nodes[0], depth: 9, isFrontierNode: true, body: 'Live text outside the captured candidate.' };
  const state = await terminal();
  expect(state.nodes[nodes[0].bundleNodeKey].selected).toBe(true);
  expect(state.nodes[nodes[1].bundleNodeKey].selected).toBe(false);
});
