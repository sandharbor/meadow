/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Page, Expect } from '@playwright/test';
import { SelectedPageDetailComponent } from '../curation/SelectedPageDetailComponent.js';

/** User actions in the pending source proposal editor. */
export class SourcingWorkspacePage {
  constructor(private page: Page, private expect: Expect) {}
  get root() { return this.page.getByTestId('sourcing-workspace'); }
  get comparison() { return this.page.getByRole('dialog', { name: 'Captured source comparison', exact: true }); }
  get identities() { return this.page.getByRole('dialog', { name: 'Source identities', exact: true }); }

  async open() {
    await this.page.getByTestId('sourcing-status').getByRole('button', { name: /source changes? available.*Review|Explore sourcing/ }).click();
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
  async select(name: string) {
    await this.root.getByRole('button', { name: 'List View', exact: true }).click();
    const deselect = this.root.getByTitle('Deselect', { exact: true });
    while (await deselect.count()) await deselect.first().click();
    await this.root.locator('tr').filter({ has: this.page.getByText(name, { exact: true }) }).click();
    await this.expect(this.root.getByRole('region', { name: 'Source review evidence', exact: true })).toBeVisible();
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
    await this.expect(this.selectedPage.getByText('Tracked', { exact: true })).toBeVisible();
  }
  async setTrackingPreference(enabled: boolean) {
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/configuration') && response.ok(), { timeout: 10000 }),
      this.root.getByRole('checkbox', { name: 'Track non-sensitive added pages', exact: true }).setChecked(enabled),
    ]);
  }
  async untrackSelected() {
    await this.selectedPage.getByTitle('More options', { exact: true }).click();
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/tracking') && response.ok(), { timeout: 10000 }),
      this.page.getByRole('button', { name: 'Untrack', exact: true }).click(),
    ]);
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
    await this.root.getByRole('button', { name: 'Compare captured content', exact: true }).click();
    await this.expect(this.comparison).toBeVisible();
    await this.expect(this.comparison.getByRole('region', { name: 'Source content comparison' })).toBeVisible();
  }
  async closeComparison() { await this.comparison.getByRole('button', { name: 'Close', exact: true }).click(); }
  async updateSources() {
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/refresh') && response.ok(), { timeout: 10000 }),
      this.root.locator('header').getByRole('button', { name: 'Update sources', exact: true }).click(),
    ]);
    await this.expect(this.root.locator('header').getByRole('button', { name: 'Update sources', exact: true })).toBeEnabled();
  }
  async chooseIdentity(id: string, destination: string | null) {
    const group = this.identities.getByTestId(`source-move-${id}`);
    const choice = group.getByRole('radio', { name: destination ? `Same page — ${destination}` : 'Different pages — remove the old configuration at acceptance', exact: true });
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/identities') && response.ok(), { timeout: 10000 }),
      choice.click(),
    ]);
    await this.expect(choice).toBeChecked();
  }
  async continueToGraph() {
    await this.identities.getByRole('button', { name: 'Continue to graph', exact: true }).click();
    await this.expect(this.identities).toBeHidden();
  }
  get sensitivityReview() { return this.page.getByRole('dialog', { name: 'Review tracking sensitivity', exact: true }); }
  async reviewTrackingChoices(count: number) {
    await this.root.getByRole('button', { name: `Review ${count} tracking choices`, exact: true }).click();
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
    await this.expect(this.root.getByRole('button', { name: 'Accept source changes', exact: true })).toBeEnabled();
    await this.root.getByRole('button', { name: 'Accept source changes', exact: true }).click();
    await this.expect(this.root).toBeHidden();
  }
  async later() {
    await this.root.getByRole('button', { name: 'Later', exact: true }).click();
    await this.expect(this.root).toBeHidden();
  }
}
