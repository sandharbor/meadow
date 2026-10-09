/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Locator, Expect, Page } from '@playwright/test';

/** A single proposed identity match within source review. */
export class SourceMoveReview {
  constructor(private row: Locator, private expect: Expect, private page: Page) {}

  /** A file with one likely match has a Same page / New page switch; a file with several lists them as options. */
  private get switch() { return this.row.getByTestId('source-identity-switch'); }
  private get options() { return this.row.locator('li[data-identity-destination]'); }
  /** Evidence such as similarity, traversal, and content comparison sits under Details. */
  private async openDetails() {
    const details = this.row.getByTestId('source-identity-details').first();
    if (await details.getAttribute('aria-expanded') !== 'true') await details.click();
  }

  async expectSamePageSelected() {
    if (await this.options.count()) await this.expect(this.options.getByRole('radio', { checked: true })).toHaveCount(1);
    else await this.expect(this.switch.getByRole('button', { name: 'Same page', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }

  async expectUnresolved(destinations: string[]) {
    await this.expect(this.row.getByRole('radio', { checked: true })).toHaveCount(0);
    await this.expect(this.options).toHaveCount(destinations.length);
    for (const destination of destinations) await this.expect(this.row.getByRole('group', { name: `Match with ${destination}`, exact: true }).getByRole('radio')).toBeVisible();
  }

  async keepSeparate() {
    const control = await this.options.count() ? this.row.getByRole('radio', { name: 'None of these — it’s a new page', exact: true })
      : this.switch.getByRole('button', { name: 'New page', exact: true });
    const saves = await this.page.getByTestId('chip-panel-backdrop').isVisible();
    await Promise.all([
      ...saves ? [this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/identities') && response.ok())] : [],
      control.click(),
    ]);
    await this.expectSeparateSelected();
  }

  async expectSeparateSelected() {
    if (await this.options.count()) await this.expect(this.row.getByRole('radio', { name: 'None of these — it’s a new page', exact: true })).toBeChecked();
    else await this.expect(this.switch.getByRole('button', { name: 'New page', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }

  /** Identity review explains what New page means beside the choices. */
  async showDifferentHelp() {
    await this.expect(this.page.getByRole('dialog', { name: 'Source identities', exact: true }).getByText('removes the old page and starts the new file fresh.', { exact: false })).toBeVisible();
  }

  async expectPreviousRoute(path: string) {
    await this.openDetails();
    await this.row.getByText('Traversal details', { exact: true }).click();
    await this.expect(this.row.getByTestId('source-file-pill').filter({ hasText: path }).first()).toBeVisible();
  }

  async compareContent() {
    await this.openDetails();
    await this.row.getByRole('button', { name: 'Compare content', exact: true }).click();
    await this.expect(this.page.getByRole('dialog', { name: 'Changes', exact: true }).getByRole('region', { name: 'Source content comparison' })).toBeVisible();
  }

  async expectContentEdit(before: string, after: string) {
    const diff = this.page.getByRole('dialog', { name: 'Changes', exact: true }).getByRole('region', { name: 'Source content comparison' });
    await this.expect(diff.getByRole('row').filter({ hasText: before })).toHaveAttribute('data-change', 'removed');
    await this.expect(diff.getByRole('row').filter({ hasText: after })).toHaveAttribute('data-change', 'added');
  }

  async expectNoContentComparison() {
    await this.openDetails();
    await this.expect(this.row.getByRole('button', { name: /^Compare content/ })).toHaveCount(0);
  }

  async expectSingleRoute(paths: string[]) {
    await this.openDetails();
    await this.row.getByText('Traversal details', { exact: true }).click();
    const pills = this.row.getByTestId('source-file-pill');
    await this.expect(pills).toHaveCount(paths.length);
    for (const [index, path] of paths.entries()) await this.expect(pills.nth(index)).toHaveAttribute('title', path);
    await this.expect(this.row.getByRole('term')).toHaveCount(0);
  }
}
