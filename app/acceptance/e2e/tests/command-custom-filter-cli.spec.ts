/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { filters, filterSensitivity, cli, bundleCuration, scenarioAreas, scenarioSections, linkedScenarioName, linkedScenarioDescription, conceptText, conceptLink } from '../../../concepts/index.js';
import type { CustomFilterConfig } from '../../../contracts/types/shared/curation/customFilters.js';
import { commandClassifier, commandFilterBundle as slug, type ExecutionResponse } from './command-filter-fixture.js';

test.use({ bundleMode: 'single-file' });
test.use({ executionSurface: 'cli', recordVideo: false });
const name = linkedScenarioName(conceptText`CLI command filters classify captured nodes, recover from errors and reuse persistent decisions`);
const description = linkedScenarioDescription(conceptText`Create a ${conceptLink(filters.id, 'Command Selector')} through the CLI, pause and resume real subprocesses, inspect failure diagnostics, repair and rerun, and verify ${conceptLink(filterSensitivity.id, 'effective sensitivity')}. Restart the Runtime to prove cache reuse, force fresh classification and accept a source edit to invalidate its inputs.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Prepare a deterministic external classifier with controlled execution and failure.` },
  create: { type: 'test', text: conceptText`Create and inspect a command filter with the default batching and concurrent invocation limits.` },
  pause: { type: 'test', text: conceptText`Pause dispatch while four batches are running, then resume and distinguish intentional failures from negative decisions.` },
  recover: { type: 'test', text: conceptText`Repair the program and rerun. Query the selected nodes and prove that matching untracked material is effectively sensitive.` },
  cache: { type: 'test', text: conceptText`Restart and reuse persistent results, edit actions without reclassification, then force a fresh evaluation.` },
  changed: { type: 'test', text: conceptText`Accept changed source content through public source commands and observe automatic reevaluation.` },
});
const areas = scenarioAreas([bundleCuration], { subAreas: [filters] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'e86ae72b-15ac-414a-9655-684454205f82' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, meadowCli, testServer, checkpoint, skipMeadowHomeStateCheck, expectLogErrors }) => {
  const fixture = commandClassifier(testServer.configDir);
  const id = 'command-classifier-cli';
  const command = (...args: string[]) => ['bundle', 'filters', slug, ...args];
  await test.step(sections.steps.setup, async () => {
    fixture.flag('hold'); fixture.flag('fail');
    await sourceCommand(() => checkpoint('external classifier waits for a release and can fail on inlink nodes'));
  });
  await test.step(sections.steps.create, async () => {
    const filter = await sourceCommand(() => meadowCli.runJson<CustomFilterConfig>(command('create', '--id', id, '--name', 'CLI private classifier', '--command', fixture.executable,
      ...fixture.args.flatMap(arg => ['--arg', arg]), '--action', 'highlight', '--action', 'mark_sensitive'), { artifactName: 'create-command-filter' }));
    expect(filter).toMatchObject({ scope: 'bundle', enabled: true, selectors: [{ field: 'command', command: { batchSize: 4, maxConcurrency: 4 } }] });
    const inspected = await sourceCommand(() => meadowCli.runJson<CustomFilterConfig>(command('show', id), { artifactName: 'inspect-command-filter' }));
    expect(inspected.selectors[0].command?.args).toEqual(fixture.args);
    await expect.poll(fixture.started).toBe(4);
    await sourceCommand(() => checkpoint('the CLI created the saved definition and four bounded batches are active'));
  });
  await test.step(sections.steps.pause, async () => {
    const paused = await sourceCommand(() => meadowCli.runJson<ExecutionResponse>(command('pause', id), { artifactName: 'pause-classifier' }));
    expect(paused.evaluations[0]).toMatchObject({ paused: true, running: 16 });
    expect(paused.evaluations[0].pending).toBeGreaterThan(0);
    const candidates = await sourceCommand(() => meadowCli.runJson<{ nodes: Array<{ bundleNodeKey: string; tracked?: boolean }> }>(['bundle', 'nodes', slug, '--scope', 'all'], { artifactName: 'inspect-pending-candidates' }));
    const candidate = candidates.nodes.find(node => !node.tracked)!;
    const unsafeDepth = await sourceCommand(() => meadowCli.runFailure(['bundle', 'node', 'set-depths', slug, '--path', candidate.bundleNodeKey.slice(5), '--outlinks', '1'], { artifactName: 'pending-assessment-blocks-depth-tracking' }));
    expect(unsafeDepth.stderr).toContain('assessment is incomplete');
    const restoreErrors = expectLogErrors(/assessment is incomplete|[Gg]enerat.*fail|Failed to generate/);
    try {
      const incomplete = await sourceCommand(() => meadowCli.runFailure(['bundle', 'generate', slug], { artifactName: 'pending-assessment-blocks-generation' }));
      expect(incomplete.stderr).toContain('assessment is incomplete');
    } finally { restoreErrors(); }
    fixture.flag('release');
    await sourceCommand(() => meadowCli.run(command('resume', id), { artifactName: 'resume-classifier' }));
    const failed = await sourceCommand(() => meadowCli.runFailure(command('wait', id), { artifactName: 'failed-classifier' }));
    const result = JSON.parse(failed.stdout) as ExecutionResponse;
    expect(result.status).toBe('failed');
    expect(result.evaluations[0].completed).toBeGreaterThan(0);
    expect(result.evaluations[0].diagnostics.some(item => item.stderr.includes('Intentional classifier failure'))).toBe(true);
    expect(Object.values(result.evaluations[0].nodes).some(node => node.state === 'completed' && node.selected === false)).toBe(true);
    await sourceCommand(() => checkpoint('CLI diagnostics distinguish failed batches from completed negative decisions'));
  });
  const { selected, revision } = await test.step(sections.steps.recover, async () => {
    fixture.flag('fail', false);
    await sourceCommand(() => meadowCli.run(command('rerun', id), { artifactName: 'rerun-repaired-classifier' }));
    const completed = await sourceCommand(() => meadowCli.runJson<ExecutionResponse>(command('wait', id), { artifactName: 'recovered-classifier' }));
    expect(completed.status).toBe('completed');
    const selected = await sourceCommand(() => meadowCli.runJson<{ nodes: Array<{ bundleNodeKey: string; bundleNodeName: string; tracked?: boolean }> }>(['bundle', 'nodes', slug, '--scope', 'all', '--filter', `custom-${id}=solo`], { artifactName: 'command-selected-nodes' }));
    expect(selected.nodes).toHaveLength(7);
    expect(selected.nodes.every(node => node.bundleNodeName.toLowerCase().includes('inlink'))).toBe(true);
    const untracked = selected.nodes[0];
    await sourceCommand(() => meadowCli.run(['bundle', 'node', 'untrack', slug, '--path', untracked.bundleNodeKey.slice(5)], { artifactName: 'untrack-classified-node' }));
    const protectedNode = await sourceCommand(() => meadowCli.runFailure(['bundle', 'node', 'track', slug, '--path', untracked.bundleNodeKey.slice(5)], { artifactName: 'sensitive-node-protected' }));
    expect(protectedNode.stderr).toContain('sensitive');
    await sourceCommand(() => checkpoint('repaired classification selects the expected seven nodes and protects automatic inclusion'));
    return { selected, revision: completed.evaluations[0].revision };
  });
  await test.step(sections.steps.cache, async () => {
    fixture.flag('must-not-run');
    await testServer.restartRuntime();
    const reused = await sourceCommand(() => meadowCli.runJson<ExecutionResponse>(command('wait', id), { artifactName: 'persistent-cache-reused' }));
    expect(reused.evaluations[0].cached).toBe(reused.evaluations[0].total);
    const definition = await sourceCommand(() => meadowCli.runJson<CustomFilterConfig>(command('show', id), { artifactName: 'read-selector-for-mixing' }));
    const selectors = [...definition.selectors, { field: 'title', matchType: 'substring', value: 'inlink gap' }];
    await sourceCommand(() => meadowCli.run(command('edit', id, '--selectors', JSON.stringify(selectors), '--combine', 'intersection'), { artifactName: 'intersect-command-with-title' }));
    const intersection = await sourceCommand(() => meadowCli.runJson<{ nodes: Array<{ bundleNodeName: string }> }>(['bundle', 'nodes', slug, '--scope', 'all', '--filter', `custom-${id}=solo`], { artifactName: 'mixed-selector-results' }));
    expect(intersection.nodes).toHaveLength(1);
    expect(intersection.nodes[0].bundleNodeName).toContain('inlink gap');
    await sourceCommand(() => meadowCli.run(command('edit', id, '--selectors', JSON.stringify(definition.selectors), '--combine', 'union', '--scope', 'global'), { artifactName: 'move-command-filter-to-global' }));
    const global = await sourceCommand(() => meadowCli.runJson<CustomFilterConfig>(command('show', id), { artifactName: 'inspect-global-command-filter' }));
    expect(global.scope).toBe('global');
    await sourceCommand(() => meadowCli.run(command('edit', id, '--name', 'Renamed classifier', '--action', 'highlight'), { artifactName: 'edit-actions-with-cache' }));
    const edited = await sourceCommand(() => meadowCli.runJson<ExecutionResponse>(command('wait', id), { artifactName: 'action-edit-reuses-results' }));
    expect(edited.evaluations[0].revision).toBe(revision);
    await sourceCommand(() => meadowCli.run(command('rerun', id), { artifactName: 'force-unchanged-inputs' }));
    const forced = await sourceCommand(() => meadowCli.runFailure(command('wait', id), { artifactName: 'force-proves-invocation' }));
    expect(forced.stdout).toContain('Unexpected invocation');
    fixture.flag('must-not-run', false);
    await sourceCommand(() => meadowCli.run(command('rerun', id), { artifactName: 'recover-force-test' }));
    await sourceCommand(() => meadowCli.run(command('wait', id), { artifactName: 'force-test-recovered' }));
    await sourceCommand(() => checkpoint('persistent cache survives restart and action edits while force rerun really executes again'));
  });
  await test.step(sections.steps.changed, async () => {
    const sourcePath = selected.nodes[0].bundleNodeKey.slice(5);
    const sourceRoot = path.join(testServer.sourceGraphsDir, 'meadow-test-bundles-data');
    fs.appendFileSync(path.join(sourceRoot, sourcePath), '\nCommand classifier source input changed.\n');
    const reviewed = await sourceCommand(() => meadowCli.runJson<{ candidate: { id: string }; reviewToken: string }>(['bundle', 'sources', 'refresh', slug], { artifactName: 'capture-changed-input' }));
    await sourceCommand(() => meadowCli.run(['bundle', 'sources', 'accept', slug, '--snapshot', reviewed.candidate.id, '--review-token', reviewed.reviewToken], { artifactName: 'accept-changed-input' }));
    const changed = await sourceCommand(() => meadowCli.runJson<ExecutionResponse>(command('wait', id), { artifactName: 'changed-input-evaluation' }));
    expect(changed.status).toBe('completed');
    expect(changed.evaluations[0].revision).not.toBe(revision);
    await sourceCommand(() => meadowCli.run(command('disable', id), { artifactName: 'disable-classifier' }));
    await sourceCommand(() => meadowCli.run(command('enable', id), { artifactName: 'enable-classifier' }));
    await sourceCommand(() => meadowCli.run(command('delete', id), { artifactName: 'delete-classifier' }));
    void cli;
    await sourceCommand(() => checkpoint('accepted source changes invalidate classification and CLI management remains available'));
  });
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
