/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage, FilterPanelComponent } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { filters, filterSensitivity, bundleCuration, scenarioAreas, scenarioSections, linkedScenarioName, linkedScenarioDescription, conceptText, conceptLink } from '../../../concepts/index.js';
import { commandClassifier } from './command-filter-fixture.js';

test.use({ bundleMode: 'single-file' });
const name = linkedScenarioName(conceptText`Command custom filters show progress, pause, explain failures and recover highlighted sensitive nodes`);
const description = linkedScenarioDescription(conceptText`Configure a ${conceptLink(filters.id, 'Command Selector')} in Curation. Its real program classifies the complete candidate graph while the user pauses and resumes dispatch. Read a diagnostic failure modal, repair the program and rerun, then inspect highlighted nodes with ${conceptLink(filterSensitivity.id, 'filter-derived sensitivity')}. Reopening reuses decisions; a forced rerun refreshes them.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open Big and prepare a classifier that waits for a release and intentionally fails for known nodes.` },
  configure: { type: 'test', text: conceptText`Create a Command Selector with default batching and Highlight plus Mark Sensitive actions.` },
  pause: { type: 'test', text: conceptText`Observe active progress, pause new dispatch, let active batches finish, and resume.` },
  diagnose: { type: 'test', text: conceptText`Read the failure explanation and affected nodes in the error modal.` },
  recover: { type: 'test', text: conceptText`Fix the external program and rerun. Solo its seven matching nodes and inspect highlighting and sensitivity.` },
  reuse: { type: 'test', text: conceptText`Reopen the graph with a program that fails if unexpectedly invoked, then force rerun to prove explicit refreshing.` },
});
const areas = scenarioAreas([bundleCuration], { subAreas: [filters] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'e5500f1a-57fa-4685-822b-b1c5152661cf' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const editor = new BundleEditorPage(page, expect);
  const panel = new FilterPanelComponent(page, expect);
  const fixture = commandClassifier(testServer.configDir);
  const progress = panel.commandFilterProgress;
  const filterName = 'External private classifier';
  await test.step(sections.steps.setup, async () => {
    fixture.flag('hold'); fixture.flag('fail');
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => checkpoint('Big is ready for a custom command classifier'));
  });
  await test.step(sections.steps.configure, async () => {
    await sourceCommand(() => panel.clickAddCustomFilter());
    const dialog = page.getByRole('dialog', { name: 'Create Custom Filter', exact: true });
    await sourceCommand(() => dialog.getByPlaceholder('Enter filter name').fill(filterName));
    await sourceCommand(() => panel.chooseCommandSelector());
    await sourceCommand(() => dialog.getByLabel('Executable', { exact: true }).fill(fixture.executable));
    await sourceCommand(() => dialog.getByLabel('Command arguments', { exact: true }).fill(fixture.args.join('\n')));
    await expect(dialog.getByLabel('Batch size', { exact: true })).toHaveValue('4');
    await expect(dialog.getByLabel('Concurrency', { exact: true })).toHaveValue('4');
    await sourceCommand(() => panel.addCommandSensitivityAction());
    await sourceCommand(() => dialog.getByLabel('Executable', { exact: true }).scrollIntoViewIfNeeded());
    await sourceCommand(() => addKeyFrame(filters, filterSensitivity));
    await sourceCommand(() => checkpoint('Command filter is configured with default 4/4 execution and both actions'));
    await sourceCommand(() => dialog.getByRole('button', { name: 'Save Filter', exact: true }).click());
    await expect(dialog).toBeHidden();
    await expect.poll(fixture.started).toBe(4);
    await expect(progress.getByRole('status')).toContainText('16 running');
  });
  await test.step(sections.steps.pause, async () => {
    await sourceCommand(() => progress.scrollIntoViewIfNeeded());
    await sourceCommand(() => addKeyFrame(filters));
    await sourceCommand(() => progress.getByRole('button', { name: 'Pause', exact: true }).click());
    await expect(progress.getByRole('status')).toContainText('Paused');
    await sourceCommand(() => editor.sourceReview.open());
    await expect(editor.sourceReview.root).toContainText('Command filter sensitivity assessment is incomplete');
    await expect(editor.sourceReview.root.getByRole('button', { name: 'Accept changes', exact: true })).toBeDisabled();
    await sourceCommand(() => addKeyFrame(filters, filterSensitivity));
    await sourceCommand(() => checkpoint('source review stays available while incomplete sensitivity prevents acceptance'));
    await sourceCommand(() => editor.sourceReview.close());
    fixture.flag('release');
    await expect(progress.getByRole('status')).toContainText('0 running');
    expect(fixture.started()).toBe(4);
    await sourceCommand(() => progress.scrollIntoViewIfNeeded());
    await sourceCommand(() => addKeyFrame(filters));
    await sourceCommand(() => checkpoint('paused classification preserves finished work and leaves the remaining batches pending'));
    await sourceCommand(() => progress.getByRole('button', { name: 'Resume', exact: true }).click());
    await expect(progress.getByRole('status')).toContainText('0 pending');
    await expect(progress.getByRole('status')).toContainText('0 running');
  });
  await test.step(sections.steps.diagnose, async () => {
    await sourceCommand(() => progress.getByRole('button', { name: /^Errors/ }).click());
    const errors = page.getByRole('dialog', { name: 'Command filter errors', exact: true });
    await expect(errors).toContainText('Intentional classifier failure for inlink nodes');
    await expect(errors).toContainText('Affected nodes:');
    await expect(errors).toContainText('Exit status: 7');
    await sourceCommand(() => addKeyFrame(filters));
    await sourceCommand(() => checkpoint('command failure modal explains affected batches and retains stderr diagnostics'));
    await sourceCommand(() => errors.getByRole('button', { name: 'Close', exact: true }).click());
    await expect(progress.getByRole('button', { name: /^Errors/ })).toBeVisible();
  });
  await test.step(sections.steps.recover, async () => {
    fixture.flag('fail', false);
    await sourceCommand(() => progress.getByRole('button', { name: 'Rerun', exact: true }).click());
    await expect(progress.getByRole('status')).toContainText('0 failed');
    await expect(progress.getByRole('status')).toContainText('0 pending');
    await expect(progress.getByRole('status')).toContainText('0 running');
    await expect(progress.getByText(/Assessment incomplete/)).toHaveCount(0);
    await sourceCommand(() => editor.sourceReview.expectSensitivityReviewReady());
    await expect(editor.sourceReview.sensitivityReview).toContainText(filterName);
    await expect(editor.sourceReview.sensitivityReview).toContainText('was added');
    await sourceCommand(() => editor.sourceReview.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
    await sourceCommand(() => editor.sourceReview.close());
    await sourceCommand(() => panel.enableAndSoloFilter(filterName));
    await sourceCommand(() => editor.expectGraphViewPageCount(7));
    await sourceCommand(() => editor.expectGraphHighlightCount('#FFD700', 7));
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.clickSelectAll());
    const titles = await sourceCommand(() => editor.getSelectedPageTitles());
    expect(titles).toHaveLength(7);
    expect(titles.every(title => title.toLowerCase().includes('inlink'))).toBe(true);
    await sourceCommand(() => editor.expectSelectedSensitivePageCount(7));
    await sourceCommand(() => editor.clickSelectNone());
    await sourceCommand(() => editor.switchToGraphView());
    await expect(page.getByTestId('graph-page-node').first()).toBeInViewport();
    await sourceCommand(() => addKeyFrame(filters, filterSensitivity));
    await sourceCommand(() => checkpoint('recovered classifier highlights and marks the expected seven nodes sensitive'));
  });
  await test.step(sections.steps.reuse, async () => {
    const invocations = fixture.started();
    fixture.flag('must-not-run');
    await sourceCommand(() => page.reload());
    await sourceCommand(() => editor.sourceReview.expectSensitivityReviewReady());
    await sourceCommand(() => editor.sourceReview.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
    await sourceCommand(() => editor.sourceReview.close());
    await sourceCommand(() => editor.waitForSourceCheck());
    await expect(progress.getByRole('status')).toContainText('0 failed');
    await sourceCommand(() => editor.expectGraphHighlightCount('#FFD700', 7));
    expect(fixture.started()).toBe(invocations);
    await sourceCommand(() => progress.getByRole('button', { name: 'Rerun', exact: true }).click());
    await expect(progress.getByRole('button', { name: /^Errors/ })).toBeVisible();
    fixture.flag('must-not-run', false);
    await sourceCommand(() => progress.getByRole('button', { name: 'Rerun', exact: true }).click());
    await expect(progress.getByText(/Assessment incomplete/)).toHaveCount(0);
    await sourceCommand(() => editor.expectGraphHighlightCount('#FFD700', 7));
    await sourceCommand(() => addKeyFrame(filters, filterSensitivity));
    await sourceCommand(() => checkpoint('reopening reuses decisions and an explicit rerun refreshes unchanged inputs'));
  });
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
