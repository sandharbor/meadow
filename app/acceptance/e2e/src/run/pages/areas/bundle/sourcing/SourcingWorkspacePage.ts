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
    await this.expectLoaded();
  }
  /** The editor beneath shows through until review has loaded what it shows, so wait for that before using it. */
  async expectLoaded() {
    await this.expect(this.root.getByRole('status', { name: 'Loading page changes', exact: true })).toHaveCount(0);
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
  /** Track added pages, shown beside the changes to accept when there are added pages without a tracking choice. */
  get trackAdditionsOption() { return this.root.getByRole('checkbox', { name: 'Track added pages', exact: true }); }
  async expectTrackAdditions(checked: boolean) { await this.expect(this.trackAdditionsOption).toBeChecked({ checked }); }
  async setTrackAdditions(on: boolean) {
    await this.expect(this.trackAdditionsOption).toBeVisible();
    if (await this.trackAdditionsOption.isChecked() === on) return;
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/track-additions') && response.ok(), { timeout: 10000 }),
      // The checkbox reflects the saved proposal, so it changes once the server confirms.
      this.trackAdditionsOption.click(),
    ]);
    await this.expectTrackAdditions(on);
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
  /** The bar reads refresh, then what Accept changes applies, then Accept changes, then the close button. */
  async expectMainReviewActions() {
    const accept = this.root.locator('header').getByRole('button', { name: 'Accept changes', exact: true });
    for (const control of [this.refreshSourcesButton, accept, this.exitButton]) await this.expect(control).toBeVisible();
    const [refresh, acceptBox, exit] = await Promise.all([this.refreshSourcesButton, accept, this.exitButton].map(control => control.boundingBox()));
    this.expect(refresh!.x).toBeLessThan(acceptBox!.x);
    this.expect(acceptBox!.x).toBeLessThan(exit!.x);
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
  /**
   * The identity review row that holds a file: its own row, or the row of the group of files that share its rename,
   * whose Details lists each file.
   */
  private identityHolder(id: string) {
    return this.identities.locator(`[data-testid="source-move-${id}"]:not([data-testid="source-identity-group"] [data-testid="source-move-${id}"]), [data-testid="source-identity-group"][data-identity-ids*=${JSON.stringify(`"${id}"`)}]`);
  }
  private async saving(action: () => Promise<void>) {
    if (!await this.identityBackdrop.isVisible()) { await action(); return; }
    await Promise.all([this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/identities') && response.ok(), { timeout: 10000 }), action()]);
  }
  /** Bring a file's row into view, opening its group's Details when the file shares a rename with others. */
  protected async showIdentityRecord(record: Locator) {
    await this.expect(this.identities).toBeVisible();
    const group = record.locator('xpath=ancestor::*[@data-testid="source-identity-group"]');
    if (await group.count()) {
      const details = group.getByTestId('source-identity-details').first();
      if (await details.getAttribute('aria-expanded') !== 'true') await details.click();
    }
    await record.scrollIntoViewIfNeeded();
    await this.expect(record).toBeVisible();
  }
  async showIdentity(id: string) {
    const group = this.identities.locator(`[data-testid="source-identity-group"][data-identity-ids*=${JSON.stringify(`"${id}"`)}]`);
    if (await group.count()) {
      const details = group.getByTestId('source-identity-details').first();
      if (await details.getAttribute('aria-expanded') !== 'true') await details.click();
    }
    await this.showIdentityRecord(this.identityRow(id));
  }
  /** A group of files whose shared rename moves them from one folder to another. */
  private directoryIdentityGroup(before: string, after: string) {
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.identities.getByTestId('source-identity-group').filter({ has: this.page.getByRole('group', { name: new RegExp(`^Moved(?: and renamed)?: ${escape(before)}/.* → ${escape(after)}/`) }) });
  }
  async expectDirectoryGroupCollapsed(before: string, after: string, count: number) {
    const group = this.directoryIdentityGroup(before, after);
    await this.expect(group).toHaveCount(1);
    await this.expect(group.getByTestId('source-identity-details').first()).toHaveAttribute('aria-expanded', 'false');
    await this.expect(group).toContainText(`+ ${count - 1} more ${count === 2 ? 'file' : 'files'} renamed the same way`);
    await this.expect(group.getByTestId('source-identity-switch').first()).toHaveAttribute('data-current-choice', 'same');
    await this.expect(group.getByTestId(/^source-move-/)).toHaveCount(0);
  }
  async openDirectoryGroup(before: string, after: string) {
    const details = this.directoryIdentityGroup(before, after).getByTestId('source-identity-details').first();
    await details.click();
    await this.expect(details).toHaveAttribute('aria-expanded', 'true');
  }
  async expectDirectoryGroupExpanded(before: string, after: string, count: number) {
    const group = this.directoryIdentityGroup(before, after);
    await this.expect(group.getByTestId('source-identity-details').first()).toHaveAttribute('aria-expanded', 'true');
    await this.expect(group.getByTestId(/^source-move-/)).toHaveCount(count);
    await group.scrollIntoViewIfNeeded();
  }
  /** Change the file's row, or its group's row, to Same page or New page. */
  async chooseCompactIdentity(id: string, option: string, _currentChoice?: 'Same' | 'Different' | 'Choose') {
    const holder = this.identityHolder(id);
    await holder.scrollIntoViewIfNeeded();
    await this.saving(() => holder.getByTestId('source-identity-switch').first().getByRole('button', { name: /^(Same|Pick)/.test(option) ? 'Same page' : 'New page', exact: true }).click());
  }
  async expectCompactIdentity(id: string, choice: 'Same' | 'Different' | 'Choose', count?: number) {
    const holder = this.identityHolder(id);
    await this.expect(holder.getByTestId('source-identity-switch').first()).toHaveAttribute('data-current-choice', choice === 'Same' ? 'same' : choice === 'Different' ? 'different' : 'input');
    if (count !== undefined && count > 1) await this.expect(holder).toContainText(`+ ${count - 1} more`);
  }
  /** Press a file's Same page or New page without waiting for the choice to save, as while a save is held. */
  async pressIdentity(id: string, choice: 'Same page' | 'New page') {
    await this.showIdentity(id);
    await this.identityRow(id).getByRole('button', { name: choice, exact: true }).click();
  }
  /** The group holding a file shows mixed choices once its files no longer share one answer. */
  async expectMixedIdentityGroup(id: string) {
    const group = this.identities.locator(`[data-testid="source-identity-group"][data-identity-ids*=${JSON.stringify(`"${id}"`)}]`);
    await this.expect(group.getByTestId('source-identity-switch').first()).toHaveAttribute('data-current-choice', 'mixed');
    await this.expect(group).toContainText('mixed choices');
  }
  async chooseInputIdentity(id: string, destination: string | null) { await this.chooseIdentity(id, destination); }
  /** A file with several possible matches lists them as options, none chosen yet. */
  async expectPickRequired(id: string) {
    const row = this.identityRow(id);
    await this.expect(row.locator('li[data-identity-destination]').first()).toBeVisible();
    await this.expect(row.getByRole('radio', { checked: true })).toHaveCount(0);
    await row.scrollIntoViewIfNeeded();
  }
  /** The file change and its Same page / New page switch share one row. */
  async expectChoicesAlignedWithSummary(id: string) {
    const row = this.identityRow(id);
    const choices = (await row.getByTestId('source-identity-switch').boundingBox())!;
    const summary = (await row.getByRole('group', { name: /→/ }).first().boundingBox())!;
    this.expect(Math.abs(choices.y + choices.height / 2 - summary.y - summary.height / 2)).toBeLessThanOrEqual(4);
    await this.expect(row.getByRole('button', { name: 'Same page', exact: true })).toBeInViewport();
    await this.expect(row.getByRole('button', { name: 'New page', exact: true })).toBeInViewport();
  }
  async expectInputIdentity(id: string, destination: string | null) {
    const row = this.identityRow(id);
    if (await row.locator('li[data-identity-destination]').count()) {
      const choice = destination === null ? row.getByRole('radio', { name: 'None of these — it’s a new page', exact: true })
        : row.locator(`li[data-identity-destination=${JSON.stringify(destination)}]`).getByRole('radio');
      await this.expect(choice).toBeChecked();
      return;
    }
    await this.expectIdentityDecision(id, destination === null ? 'New page' : 'Same page');
  }
  /** Save the suggested choice for every likely rename not yet decided, as Confirm does. */
  async acceptAllIdentitySuggestions() {
    const switches = this.identitySection('Likely renamed').getByTestId('source-identity-switch');
    for (const control of await switches.all()) {
      if (await control.getAttribute('data-current-choice') !== 'same') continue;
      await this.saving(() => control.getByRole('button', { name: 'Same page', exact: true }).click());
    }
  }
  /** The panel heading and its Confirm stay in place while the identity list scrolls. */
  async expectIdentityActionsStayVisibleWhenScrolling() {
    const list = this.identities.getByTestId('source-identity-list');
    const actions = [this.identities.getByRole('heading', { name: 'Source identities', exact: true }), this.identityButton('Confirm')];
    const before = await Promise.all(actions.map(action => action.boundingBox()));
    this.expect(before.every(Boolean)).toBe(true);
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await this.expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    for (const [index, action] of actions.entries()) {
      await this.expect(action).toBeInViewport();
      this.expect((await action.boundingBox())!.y).toBe(before[index]!.y);
    }
  }
  async scrollIdentityListToStart() {
    await this.identities.getByTestId('source-identity-list').evaluate(element => { element.scrollTop = 0; });
  }
  async toggleIdentitySimilarity(id: string) {
    await this.showIdentity(id);
    const row = this.identityRow(id);
    const details = row.getByTestId('source-identity-details').first();
    if (await details.getAttribute('aria-expanded') !== 'true') await details.click();
    await row.locator('summary').filter({ hasText: 'Similarity' }).first().click();
  }
  async chooseIdentity(id: string, destination: string | null) {
    await this.showIdentity(id);
    await this.decideIdentity(id, destination);
  }
  /** The dimming behind identity review while it is required. */
  get identityBackdrop() { return this.root.getByTestId('chip-panel-backdrop'); }
  identityRow(id: string) { return this.identities.getByTestId(`source-move-${id}`); }
  identitySection(name: 'Choose a match' | 'Likely renamed' | 'Already decided') { return this.identities.getByRole('region', { name: new RegExp(`^${name}\\b`) }); }
  identityButton(name: 'Cancel' | 'Confirm' | 'Update') { return this.identities.getByRole('button', { name, exact: true }); }
  /**
   * Decide a file in identity review: a destination keeps it as the same page, null makes it a new page. While
   * review is required each choice saves immediately; on a revisit it stays a draft until Update.
   */
  async decideIdentity(id: string, destination: string | null) {
    const row = this.identityRow(id);
    const candidates = row.locator('li[data-identity-destination]');
    const control = await candidates.count()
      ? destination ? row.locator(`li[data-identity-destination=${JSON.stringify(destination)}]`).getByRole('radio')
        : row.getByRole('radio', { name: 'None of these — it’s a new page', exact: true })
      : row.getByRole('button', { name: destination ? 'Same page' : 'New page', exact: true });
    const saves = await this.identityBackdrop.isVisible();
    await Promise.all([
      ...saves ? [this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/identities') && response.ok(), { timeout: 10000 })] : [],
      control.click(),
    ]);
    if (await candidates.count()) await this.expect(control).toBeChecked();
    else await this.expect(control).toHaveAttribute('aria-pressed', 'true');
  }
  async expectIdentityDecision(id: string, choice: 'Same page' | 'New page' | 'Undecided') {
    await this.expect(this.identityRow(id).getByTestId('source-identity-switch')).toHaveAttribute('data-current-choice', choice === 'Same page' ? 'same' : choice === 'New page' ? 'different' : 'input');
  }
  /** For a file with several possible matches, the chosen destination's option is selected. */
  async expectIdentityMatch(id: string, destination: string) {
    await this.expect(this.identityRow(id).locator(`li[data-identity-destination=${JSON.stringify(destination)}]`).getByRole('radio')).toBeChecked();
  }
  /** Open identity review from its chip. */
  async openIdentities() {
    await this.acceptedChange(/^\d+ identity decisions?$/).click();
    await this.expect(this.identities).toBeVisible();
  }
  /** Finish identity review: Confirm when it is required, otherwise Update any edits or close it. */
  async confirmIdentities() {
    if (await this.identityButton('Confirm').count()) await this.identityButton('Confirm').click();
    else if (await this.identityButton('Update').isEnabled()) await this.updateIdentities();
    else await this.identityButton('Cancel').click();
    await this.expect(this.identities).toBeHidden();
  }
  /** Apply the edits made while revisiting identity review. */
  async updateIdentities() {
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/identities') && response.ok(), { timeout: 10000 }),
      this.identityButton('Update').click(),
    ]);
    await this.expect(this.identities).toBeHidden();
  }
  /** The bar's refresh stays usable above the identity panel. */
  async refreshIdentitySources() {
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/refresh') && response.ok()),
      this.refreshSourcesButton.click(),
    ]);
    await this.expect(this.refreshSourcesButton).toBeEnabled();
  }
  /** Confirm identity review and continue to the graph. */
  async continueToGraph() { await this.confirmIdentities(); }
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
  /** The bubble of changes sits just left of Accept changes, its tail pointing into the button. */
  async expectTrayPointsAtAccept() {
    const accept = (await this.root.getByRole('button', { name: 'Accept changes', exact: true }).boundingBox())!;
    const tail = (await this.root.getByTestId('accepted-changes-tail').boundingBox())!;
    this.expect(accept.x - (tail.x + tail.width)).toBeGreaterThanOrEqual(0);
    this.expect(accept.x - (tail.x + tail.width)).toBeLessThanOrEqual(6);
    this.expect(Math.abs(tail.y + tail.height / 2 - (accept.y + accept.height / 2))).toBeLessThanOrEqual(2);
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
