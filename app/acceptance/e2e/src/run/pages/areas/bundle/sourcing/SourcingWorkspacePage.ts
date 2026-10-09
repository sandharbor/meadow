/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Page, Expect, Locator } from '@playwright/test';
import { SelectedPageDetailComponent } from '../curation/SelectedPageDetailComponent.js';
import { AppPlace } from '../../../shared/AppPlace.js';

/** User actions in the pending source proposal editor. */
export class SourcingWorkspacePage {
  constructor(private page: Page, private expect: Expect) {}
  get root() { return this.page.getByTestId('sourcing-workspace'); }
  get comparison() { return this.page.getByRole('dialog', { name: 'Changes', exact: true }); }
  get identities() { return this.page.getByRole('dialog', { name: 'Source identities', exact: true }); }

  /** Sourcing opens from the review indicator, shown while source changes or a kept proposal are waiting. */
  async open() {
    await this.page.getByTestId('sourcing-status').getByRole('button', { name: /(source changes? available|Changes pending) – Review/ }).click();
    await this.expect(this.root).toBeVisible();
  }
  async expectNodeVisible(name: string, visible = true) {
    const row = this.root.locator('tr').filter({ has: this.page.getByText(name, { exact: true }) });
    if (visible) await this.expect(row).toBeVisible(); else await this.expect(row).toHaveCount(0);
  }
  async expectNodeExplanation(name: string, explanation: RegExp) {
    const row = this.root.locator('tr').filter({ has: this.page.getByText(name, { exact: true }) });
    await this.expect(row).toHaveAttribute('title', explanation);
  }
  async expectAddedContent(text: string) {
    await this.expect(this.comparison.locator('[data-change="added"]')).toContainText([text]);
  }
  /** Deselect every selected page from the selection sidebar, if any are selected. An open tray detail covers the sidebar, so it closes first. */
  async deselectAll() {
    await this.closeAcceptedChangeDetail();
    const deselect = this.root.getByTitle('Deselect', { exact: true });
    while (await deselect.count()) await deselect.first().click();
  }
  async select(name: string) {
    await this.root.getByRole('button', { name: 'List View', exact: true }).click();
    await this.deselectAll();
    await this.root.locator('tr').filter({ has: this.page.getByText(name, { exact: true }) }).click();
    await this.expect(this.selectedPage).toBeVisible();
  }
  async addToSelection(name: string) {
    await this.root.locator('tr').filter({ has: this.page.getByText(name, { exact: true }) }).click();
  }
  async clearSelection() { await this.root.getByRole('button', { name: 'Select None', exact: true }).click(); }
  async expectListOpacity(name: string, opacity: number) {
    await this.expect(this.root.locator('tr').filter({ has: this.page.getByText(name, { exact: true }) })).toHaveCSS('opacity', String(opacity));
  }
  async expectGraphOpacity(key: string, opacity: number) {
    await this.expect(this.root.locator(`[data-testid="graph-page-node"][data-page-id="${key}"]`)).toHaveCSS('opacity', String(opacity));
  }
  get selectedPage() { return this.root.locator('[data-testid^="selected-page-"]'); }
  get evidence() { return this.root.getByRole('region', { name: 'Source review evidence', exact: true }); }
  /** What accepting does to the selected page: Add, Rename, Modify, or Remove. */
  get changeKind() { return this.evidence.getByTestId('source-change-kind'); }
  async expectNoSelectedSourceChange() {
    await this.expect(this.selectedPage).toBeVisible();
    await this.expect(this.evidence).toHaveCount(0);
    await this.expect(this.selectedPage.getByRole('button', { name: 'Details', exact: true })).toBeVisible();
  }
  async expectSelectedRename(before: string, after: string) {
    const change = this.evidence.getByTestId('source-path-change');
    await this.expect(change).toHaveAttribute('title', `${before} → ${after}`);
    await this.expect(this.evidence).not.toContainText('location and route');
    const directory = (value: string) => value.slice(0, Math.max(0, value.lastIndexOf('/')));
    const filename = (value: string) => value.slice(value.lastIndexOf('/') + 1);
    if (directory(before) === directory(after)) {
      await this.expect(change.getByTestId('source-path-before')).toHaveText(filename(before));
      await this.expect(change.getByTestId('source-path-after')).toHaveText(filename(after));
    } else if (filename(before) === filename(after)) {
      await this.expect(change.getByTestId('source-path-before')).toHaveText(directory(before) || 'Source root');
      await this.expect(change.getByTestId('source-path-after')).toHaveText(directory(after) || 'Source root');
    }
    await this.expect(this.evidence.getByRole('button', { name: 'See file content changes', exact: true })).toBeVisible();
  }
  /** The reason heads a disclosure; Not reachable opens to the upstream break, the others to their description. */
  async expectSelectedRemovalReason(label: 'Source missing' | 'Not reachable' | 'Disconnected' | 'Blacklisted') {
    // The explanation is the most specific available: an upstream break, a file-level diagnosis, or the reason's description.
    await this.expect(this.selectedPage.getByRole('button', { name: 'Details before removal', exact: true })).toBeVisible();
    const details = this.evidence.getByTestId('source-removal-reason');
    await this.expect(details.locator('summary')).toHaveText(label);
    if (await details.getAttribute('open') === null) await details.locator('summary').click();
    const explanations = {
      'Source missing': /Missing on disk when the proposed capture was made\.|does not exist in the filesystem\./,
      'Not reachable': /no longer links to|is blacklisted|is missing|source is disconnected|traversal settings stop|filesystem/,
      Disconnected: /Its source was removed from the proposed registry\./,
      Blacklisted: /This page is blacklisted in the proposed configuration\./,
    };
    await this.expect(details.getByTestId('source-removal-explanation')).toContainText(explanations[label]);
    await this.expect(this.evidence).not.toContainText('location and route');
    await this.expect(this.evidence).not.toContainText('Orphaned configuration');
  }
  async expectSelectedRoute(names: string[]) {
    await new SelectedPageDetailComponent(this.selectedPage, this.expect).openDetails();
    for (const name of names) await this.expect(this.selectedPage.getByTestId('selected-node-details').getByText(name, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  }
  async expectRemovedLineCount(count: number) {
    await this.expect(this.evidence.getByTestId('source-line-counts')).toHaveAttribute('aria-label', `${count} removed lines`);
    await this.expect(this.evidence.getByText(`-${count}`, { exact: true })).toBeVisible();
    await this.expect(this.evidence.getByText(/^\+/)).toHaveCount(0);
  }
  async seePreviousContent(text: string) {
    await this.evidence.getByRole('button', { name: 'See previous content', exact: true }).click();
    // A removal shows its previous content as deleted lines.
    await this.expect(this.comparison.getByRole('region', { name: 'Previous source content', exact: true })).toContainText(text);
  }
  async expectSelectedLineCounts(added: number, removed: number) {
    const counts = this.evidence.getByTestId('source-line-counts');
    await this.expect(counts).toHaveAttribute('aria-label', `${added} added lines, ${removed} removed lines`);
    await this.expect(counts.getByText(`+${added}`, { exact: true })).toHaveCSS('color', 'rgb(5, 150, 105)');
    await this.expect(counts.getByText(`-${removed}`, { exact: true })).toHaveCSS('color', 'rgb(220, 38, 38)');
  }
  async expectSelectedChangeSummary(name: string, kind: 'Add' | 'Rename' | 'Modify' | 'Remove') {
    await this.expect(this.changeKind).toHaveText(kind);
    // Evidence shares the proposal's light blue; only the change name carries its category color.
    const colors = { Add: 'rgb(22, 163, 74)', Rename: 'rgb(147, 51, 234)', Modify: 'rgb(37, 99, 235)', Remove: 'rgb(220, 38, 38)' };
    await this.expect(this.evidence).toHaveCSS('background-color', 'rgb(239, 246, 255)');
    await this.expect(this.changeKind).toHaveCSS('color', colors[kind]);
    const title = this.selectedPage.locator(':scope > div').first().getByText(name, { exact: true });
    const titleBox = (await title.boundingBox())!;
    this.expect((await this.evidence.boundingBox())!.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
    await this.expect(this.evidence.getByRole('button', { name: kind === 'Remove' ? 'See previous content' : kind === 'Rename' ? 'See file content changes' : kind === 'Add' ? 'See content' : 'See changes', exact: true })).toBeVisible();
    if (kind === 'Add') await this.expect(this.evidence).not.toContainText('location and route');
    if (kind === 'Modify') {
      await this.expect(this.evidence).not.toContainText('location and route');
      await this.expect(this.evidence).not.toContainText('Content differs');
      await this.expect(this.evidence).not.toContainText('.md');
    }
  }
  async setSelectedBlacklisted(blacklisted: boolean) {
    await this.selectedPage.getByTitle('More options', { exact: true }).click();
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/configuration') && response.ok(), { timeout: 10000 }),
      this.page.getByRole('button', { name: blacklisted ? 'Blacklist' : 'Remove from Blacklist', exact: true }).click(),
    ]);
  }
  async trackSelected() {
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/tracking') && response.ok(), { timeout: 10000 }),
      this.selectedPage.getByRole('button', { name: 'Track', exact: true }).click(),
    ]);
    await this.expect(this.refreshSourcesButton).toBeEnabled();
    await this.expect(this.selectedPage.getByText('Tracked', { exact: true })).toBeVisible();
  }
  async expectNoAutomaticTrackingOption() {
    await this.expect(this.root.getByRole('checkbox', { name: 'Track non-sensitive added pages', exact: true })).toHaveCount(0);
  }
  async untrackSelected() {
    await this.selectedPage.getByTitle('More options', { exact: true }).click();
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/tracking') && response.ok(), { timeout: 10000 }),
      this.page.getByRole('button', { name: 'Untrack', exact: true }).click(),
    ]);
    await this.expect(this.refreshSourcesButton).toBeEnabled();
    await this.expect(this.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
  }
  async setSelectedOutlinkDepth(depth: number) {
    const detail = new SelectedPageDetailComponent(this.selectedPage, this.expect);
    await detail.openDetails();
    await this.selectedPage.getByTitle(/^(Add|Edit) outlink depth override$/).click();
    await detail.setOutlinksDepth(depth);
  }
  async compare(name: string) {
    await this.select(name);
    await this.root.getByRole('button', { name: /^(See content|See changes|See file content changes|See previous content)$/ }).click();
    await this.expect(this.comparison).toBeVisible();
    await this.expect(this.comparison.getByRole('region', { name: 'Source content comparison' })).toBeVisible();
  }
  async closeComparison() { await this.comparison.getByRole('button', { name: 'Close', exact: true }).click(); }
  get exitButton() { return this.root.locator('header').getByRole('button', { name: 'Exit', exact: true }); }
  get exitReview() { return this.page.getByRole('dialog', { name: 'Exit changes review', exact: true }); }
  async expectMainReviewActions() {
    await this.expect(this.root.locator('header').getByRole('button')).toHaveText(['', 'Exit', 'Accept changes']);
    await this.expect(this.refreshSourcesButton).toBeVisible();
  }
  /** Exit, discarding the proposal's changes. An unchanged review is discarded without asking. */
  async discard() {
    await this.exitButton.click();
    if (await this.exitReview.isVisible()) await this.exitReview.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await this.expect(this.root).toBeHidden();
  }
  /** Setup only: enter sourcing by link, as the CLI or Dev Tools would, without pending source changes. */
  async openByLink(bundleSlug: string) {
    await new AppPlace(this.page, this.expect).open(`/bundle/${bundleSlug}?editorMode=sourcing`);
    await this.expect(this.root).toBeVisible();
  }
  get refreshSourcesButton() { return this.root.locator('header').getByRole('button', { name: 'Refresh sources', exact: true }); }
  async updateSources() {
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/refresh') && response.ok(), { timeout: 10000 }),
      this.refreshSourcesButton.click(),
    ]);
    await this.expect(this.refreshSourcesButton).toBeEnabled();
  }
  async selectIdentityTab(name: 'Confident suggestions' | 'Needs your input') {
    await this.identities.getByRole('tab', { name, exact: true }).click();
    await this.expect(this.identities.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
  }
  protected async showIdentityRecord(record: Locator) {
    await this.expect(this.identities).toBeVisible();
    const panel = record.locator('xpath=ancestor::*[@role="tabpanel"]');
    if (await panel.getAttribute('hidden') !== null) {
      const confident = await this.identities.getByRole('tab', { name: 'Confident suggestions', exact: true }).getAttribute('aria-selected');
      await this.selectIdentityTab(confident === 'true' ? 'Needs your input' : 'Confident suggestions');
    }
    const ancestors = record.locator('xpath=ancestor::details');
    for (const ancestor of await ancestors.all()) {
      if (await ancestor.getAttribute('open') === null) await ancestor.locator(':scope > summary').click();
    }
    const details = record.getByTestId('source-identity-record');
    if (await details.count() && await details.getAttribute('open') === null) await details.getByTestId('source-identity-record-summary').click();
    await this.expect(record).toBeVisible();
  }
  async showIdentity(id: string) {
    await this.showIdentityRecord(this.identities.getByTestId(`source-move-${id}`));
  }
  private directoryIdentityGroup(before: string, after: string) {
    return this.identities.getByTestId('source-identity-group').filter({ has: this.page.getByRole('group', { name: `Changed directories: ${before} → ${after}`, exact: true }) });
  }
  async expectDirectoryGroupCollapsed(before: string, after: string, count: number) {
    const group = this.directoryIdentityGroup(before, after);
    await this.expect(group).toHaveCount(1);
    await this.expect(group).not.toHaveAttribute('open');
    await this.expect(group.locator('xpath=ancestor::tr').getByRole('combobox', { name: `Identity choice: Same, ${count} files`, exact: true })).toBeVisible();
    await this.expect(group.getByRole('radio')).toHaveCount(0);
  }
  async openDirectoryGroup(before: string, after: string) {
    const group = this.directoryIdentityGroup(before, after);
    await group.getByTestId('source-identity-group-summary').click();
    await this.expect(group).toHaveAttribute('open');
  }
  async expectDirectoryGroupExpanded(before: string, after: string, count: number) {
    const group = this.directoryIdentityGroup(before, after);
    await this.expect(group).toHaveAttribute('open');
    await this.expect(group.locator('fieldset[data-testid^="source-move-"]')).toHaveCount(count);
    await group.getByTestId('source-identity-group-summary').scrollIntoViewIfNeeded();
  }
  async chooseCompactIdentity(id: string, option: string, currentChoice?: 'Same' | 'Different' | 'Choose') {
    const record = this.identities.getByTestId(`source-move-${id}`);
    const panel = record.locator('xpath=ancestor::*[@role="tabpanel"]');
    if (await panel.getAttribute('hidden') !== null) {
      const confident = await this.identities.getByRole('tab', { name: 'Confident suggestions', exact: true }).getAttribute('aria-selected');
      await this.selectIdentityTab(confident === 'true' ? 'Needs your input' : 'Confident suggestions');
    }
    const row = record.locator('xpath=ancestor::tr');
    const control = currentChoice ? row.getByRole('combobox', { name: new RegExp(`^Identity choice: ${currentChoice}(?:,|$)`) }) : row.getByTestId('source-identity-choice');
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/identities') && response.ok()),
      control.selectOption({ label: option }),
    ]);
    await this.expect(this.refreshSourcesButton).toBeEnabled();
  }
  async expectCompactIdentity(id: string, choice: 'Same' | 'Different' | 'Choose', count?: number) {
    const row = this.identities.getByTestId(`source-move-${id}`).locator('xpath=ancestor::tr');
    await this.expect(row.getByRole('combobox', { name: `Identity choice: ${choice}${count !== undefined ? `, ${count} ${count === 1 ? 'file' : 'files'}` : ''}`, exact: true })).toBeVisible();
  }
  async chooseInputIdentity(id: string, destination: string | null) {
    await this.selectIdentityTab('Needs your input');
    const row = this.identities.getByTestId(`source-move-${id}`).locator('xpath=ancestor::tr');
    const controls = row.getByTestId('source-identity-direct-choices');
    if (await row.getByTestId('source-identity-pick').count()) {
      await this.expect(controls).toHaveCount(0);
      await this.chooseIdentity(id, destination);
      return;
    }
    const same = controls.getByRole('radio', { name: /^Same(?: —|$)/ });
    const choice = destination === null ? controls.getByRole('radio', { name: 'Different', exact: true })
      : await same.count() === 1 ? same : controls.locator(`[data-identity-destination=${JSON.stringify(destination)}]`);
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/identities') && response.ok()),
      choice.click(),
    ]);
    await this.expect(this.refreshSourcesButton).toBeEnabled();
  }
  async expectPickRequired(id: string) {
    const record = this.identities.getByTestId(`source-move-${id}`);
    const row = record.locator('xpath=ancestor::tr');
    await this.expect(row.getByTestId('source-identity-direct-choices')).toHaveCount(0);
    await this.expect(row.getByTestId('source-identity-pick')).toHaveText('Pick');
    await this.expect(record.getByTestId('source-identity-record')).not.toHaveAttribute('open');
    await record.getByTestId('source-identity-record-summary').scrollIntoViewIfNeeded();
  }
  async expectChoicesAlignedWithSummary(id: string) {
    const record = this.identities.getByTestId(`source-move-${id}`);
    const choices = record.locator('xpath=ancestor::tr').getByTestId('source-identity-direct-choices');
    const header = record.getByTestId('source-identity-record-summary');
    const left = await choices.boundingBox();
    const right = await header.boundingBox();
    this.expect(left).not.toBeNull(); this.expect(right).not.toBeNull();
    this.expect(Math.abs(left!.y + left!.height / 2 - right!.y - right!.height / 2)).toBeLessThanOrEqual(2);
    await this.expect(choices.getByRole('radio', { name: 'Same', exact: true })).toBeInViewport();
    await this.expect(choices.getByRole('radio', { name: 'Different', exact: true })).toBeInViewport();
  }
  async expectInputIdentity(id: string, destination: string | null) {
    const record = this.identities.getByTestId(`source-move-${id}`);
    const row = record.locator('xpath=ancestor::tr');
    if (await row.getByTestId('source-identity-pick').count()) {
      await this.showIdentity(id);
      const choice = destination === null ? record.getByRole('radio', { name: 'Different', exact: true })
        : record.locator(`[data-identity-destination=${JSON.stringify(destination)}]`).getByRole('radio', { name: 'Pick', exact: true });
      await this.expect(choice).toBeChecked();
      return;
    }
    const controls = row.getByTestId('source-identity-direct-choices');
    const choice = destination === null ? controls.getByRole('radio', { name: 'Different', exact: true })
      : controls.locator(`[data-identity-destination=${JSON.stringify(destination)}]`);
    await this.expect(choice).toBeChecked();
  }
  async acceptAllIdentitySuggestions() {
    await this.selectIdentityTab('Confident suggestions');
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/identities') && response.ok()),
      this.identities.getByRole('button', { name: 'Accept all suggestions', exact: true }).click(),
    ]);
  }
  async expectIdentityActionsStayVisibleWhenScrolling() {
    const panel = this.identities.getByRole('tabpanel', { name: 'Confident suggestions', exact: true });
    const list = panel.getByTestId('source-identity-list');
    const actions = [this.identities.getByRole('button', { name: 'Refresh sources', exact: true }), panel.getByRole('button', { name: 'Accept all suggestions', exact: true })];
    const before = await Promise.all(actions.map(action => action.boundingBox()));
    this.expect(before.every(Boolean)).toBe(true);
    this.expect(before[0]!.y).toBeLessThan((await panel.boundingBox())!.y);
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await this.expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    for (const [index, action] of actions.entries()) {
      await this.expect(action).toBeInViewport();
      this.expect((await action.boundingBox())!.y).toBe(before[index]!.y);
    }
  }
  async scrollIdentityListToStart() {
    await this.identities.getByRole('tabpanel').getByTestId('source-identity-list').evaluate(element => { element.scrollTop = 0; });
  }
  async refreshIdentitySources() {
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/refresh') && response.ok()),
      this.identities.getByRole('button', { name: 'Refresh sources', exact: true }).click(),
    ]);
    await this.expect(this.refreshSourcesButton).toBeEnabled();
  }
  async toggleIdentitySimilarity(id: string) {
    await this.showIdentity(id);
    await this.identities.getByTestId(`source-move-${id}`).locator('summary').filter({ hasText: 'Similarity' }).click();
  }
  async chooseIdentity(id: string, destination: string | null) {
    await this.showIdentity(id);
    const group = this.identities.getByTestId(`source-move-${id}`);
    const choice = destination ? group.locator(`[data-identity-destination=${JSON.stringify(destination)}]`).getByRole('radio', { name: /^(Same|Pick)$/ })
      : group.getByRole('radio', { name: 'Different', exact: true });
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/identities') && response.ok(), { timeout: 10000 }),
      choice.click(),
    ]);
    await this.showIdentity(id);
    await this.expect(choice).toBeChecked();
  }
  async continueToGraph() {
    await this.identities.getByRole('button', { name: 'Continue to graph', exact: true }).click();
    await this.expect(this.identities).toBeHidden();
  }
  get sensitivityReview() { return this.page.getByRole('dialog', { name: 'Review tracking sensitivity', exact: true }); }
  get conflictReview() { return this.page.getByRole('dialog', { name: 'Resolve configuration conflicts', exact: true }); }
  /** The tray attached to Accept changes that lists what acceptance applies. */
  get acceptedChanges() { return this.root.getByRole('region', { name: 'Changes to accept', exact: true }); }
  acceptedChange(name: string | RegExp) { return this.acceptedChanges.getByRole('button', typeof name === 'string' ? { name, exact: true } : { name }); }
  acceptedChangeDetail(name: 'Page changes' | 'Configuration removals' | 'Setting changes' | 'Tracking changes') { return this.root.getByRole('region', { name, exact: true }); }
  async expectAcceptedChanges(labels: Array<string | RegExp>) {
    if (labels.length) await this.expect(this.acceptedChanges.getByRole('button')).toHaveText(labels);
    else await this.expect(this.acceptedChanges).toHaveText('No changes yet');
    await this.expectTrayPointsAtAccept();
  }
  /** The tray's caret sits under the middle of Accept changes, so the listed items read as what it applies. */
  async expectTrayPointsAtAccept() {
    const accept = (await this.root.getByRole('button', { name: 'Accept changes', exact: true }).boundingBox())!;
    const caret = (await this.acceptedChanges.getByTestId('accepted-changes-caret').boundingBox())!;
    this.expect(Math.abs(caret.x + caret.width / 2 - (accept.x + accept.width / 2))).toBeLessThanOrEqual(2);
    // The caret reaches into the header and stops just short of the button.
    this.expect(caret.y - (accept.y + accept.height)).toBeGreaterThanOrEqual(3);
    this.expect(caret.y - (accept.y + accept.height)).toBeLessThanOrEqual(6);
  }
  async openAcceptedChangeDetail(chip: string | RegExp, name: 'Page changes' | 'Configuration removals' | 'Setting changes' | 'Tracking changes') {
    const detail = this.acceptedChangeDetail(name);
    if (!await detail.isVisible()) await this.acceptedChange(chip).click();
    await this.expect(detail).toBeVisible();
    await this.expect(this.acceptedChange(chip)).toHaveAttribute('aria-expanded', 'true');
    return detail;
  }
  async closeAcceptedChangeDetail() {
    const open = this.root.getByRole('region').filter({ has: this.page.getByRole('heading', { name: /^(Page changes|Configuration removals|Setting changes|Tracking changes)$/ }) });
    if (await open.count()) await open.getByRole('button', { name: 'Close', exact: true }).click();
    await this.expect(open).toHaveCount(0);
  }
  /** Select a page from the tray's page change list. Tray selections add to the selection, so start from an empty one to inspect a single page. */
  async selectAcceptedPageChange(name: string) {
    await this.deselectAll();
    const detail = await this.openAcceptedChangeDetail(/^\d+ page changes?$/, 'Page changes');
    await detail.getByTestId('accepted-page-change').filter({ hasText: name }).first().click();
    await this.expect(detail).toBeHidden();
    await this.expect(this.selectedPage).toBeVisible();
    await this.expect(this.selectedPage).toContainText(name);
  }
  async reviewIdentities() {
    await this.acceptedChange(/^\d+ identity decisions?$/).click();
    await this.expect(this.identities).toBeVisible();
  }
  async expectNoIdentityDecisions() { await this.expect(this.root.getByRole('button', { name: /^\d+ identity decisions?$/ })).toHaveCount(0); }
  /** Choose a side for the open conflict whose title starts with the page or filter name. */
  async resolveConflict(name: string, choice: 'saved' | 'proposed') {
    const section = this.conflictReview.locator('section').filter({ has: this.page.getByRole('heading', { name: new RegExp(`^${name}(?: ·|$)`) }) });
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/conflicts') && response.ok(), { timeout: 10000 }),
      section.getByRole('button', { name: `Use ${choice}`, exact: true }).click(),
    ]);
    await this.expect(section).toHaveCount(0);
  }
  async resolveConflicts(count: number) {
    await this.acceptedChange(`Resolve ${count} ${count === 1 ? 'conflict' : 'conflicts'}`).click();
    await this.expect(this.conflictReview).toBeVisible();
  }
  async expectNoTrackingConfirmations() { await this.expect(this.root.getByRole('button', { name: /^Confirm \d+ tracking choices?$/ })).toHaveCount(0); }
  async reviewTrackingChoices(count: number) {
    await this.acceptedChange(`Confirm ${count} ${count === 1 ? 'tracking choice' : 'tracking choices'}`).click();
    await this.expect(this.sensitivityReview).toBeVisible();
  }
  async resolveSensitiveTracking(filename: string, track: boolean) {
    const section = this.sensitivityReview.locator('section').filter({ hasText: filename });
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/tracking') && response.ok(), { timeout: 10000 }),
      section.getByRole('button', { name: track ? 'Confirm tracking sensitive page' : 'Leave untracked', exact: true }).click(),
    ]);
    await this.expect(section).toHaveCount(0);
  }
  async accept() {
    await this.expect(this.root.getByRole('button', { name: 'Accept changes', exact: true })).toBeEnabled();
    await this.root.getByRole('button', { name: 'Accept changes', exact: true }).click();
    await this.expect(this.root).toBeHidden();
  }
  /** Exit, keeping any changes in the proposal for later. */
  async later() {
    await this.exitButton.click();
    if (await this.exitReview.isVisible()) await this.exitReview.getByRole('button', { name: 'Keep changes', exact: true }).click();
    await this.expect(this.root).toBeHidden();
  }
}
