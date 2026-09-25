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

import type { Page, Expect } from "@playwright/test";

export class SourceOrphansReview {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  private get modalTitle() {
    return this.page.getByRole("dialog", { name: "Source changes" });
  }

  private get orphansView() {
    return this.modalTitle.getByTestId("orphans-view");
  }

  private get orphanRows() {
    return this.orphansView.locator('[data-testid^="orphan-row-"]');
  }

  private orphanRow(title: string) {
    return this.orphansView.getByTestId(`orphan-row-${title}`);
  }

  async waitForOpen() {
    await this.expect(this.modalTitle).toBeVisible();
    await this.expect(this.orphansView).toBeVisible();
  }

  async expectClosed() {
    await this.expect(this.modalTitle).not.toBeVisible();
  }

  async expectSummaryCount(count: number) {
    await this.expect(this.modalTitle.getByTestId('source-orphans').getByRole('heading')).toHaveText(`Orphaned configuration${count >= 10 ? ` (${count})` : ''}`);
    await this.expectOrphanCount(count);
  }

  async expectNotListed(title: string) {
    await this.expect(this.orphanRow(title)).toHaveCount(0);
  }

  async getOrphanCount(): Promise<number> {
    return this.orphanRows.count();
  }

  async expectOrphanCount(count: number) {
    await this.expect(this.orphanRows).toHaveCount(count);
  }

  async expectCollapsedFile(title: string) {
    const row = this.orphanRow(title);
    await this.expect(row.locator('summary').first()).toBeVisible();
    await this.expect(row).not.toHaveAttribute('open', '');
    await this.expect(row.getByText('Why is this orphaned?', { exact: true })).not.toBeVisible();
  }

  async showHelp() {
    await this.modalTitle.getByRole('button', { name: 'About orphaned configuration' }).hover();
    await this.expect(this.modalTitle.getByRole('tooltip')).toBeVisible();
    await this.expect(this.modalTitle.getByRole('tooltip')).toHaveCSS('opacity', '1');
  }

  async checkHelp() {
    const help = this.modalTitle.getByRole('button', { name: 'About orphaned configuration' });
    const tooltip = this.modalTitle.getByRole('tooltip');
    await this.expect(tooltip).not.toBeVisible();
    await help.hover();
    await this.expect(tooltip).toBeVisible();
    await this.expect(tooltip).toContainText('The source files are untouched.');
    await this.modalTitle.getByRole('heading', { name: 'Source changes', level: 2, exact: true }).hover();
    await help.focus();
    await this.expect(tooltip).toBeVisible();
    await help.press('Tab');
    await this.expect(tooltip).not.toBeVisible();
  }

  async toggleExplanationWithKeyboard(title: string) {
    const row = this.orphanRow(title);
    const wasOpen = await row.getAttribute('open') !== null;
    const summary = row.locator('summary').first();
    await summary.focus();
    await summary.press('Enter');
    await this.expect(row.getByText('Why is this orphaned?', { exact: true })).toBeVisible({ visible: !wasOpen });
  }

  async showExplanation(title: string) {
    const row = this.orphanRow(title);
    if (await row.getAttribute('open') === null) await row.locator('summary').first().click();
    await this.expect(row.getByText('Why is this orphaned?', { exact: true })).toBeVisible();
  }

  async expectExplanation(title: string, text: string) {
    await this.expect(this.orphanRow(title)).toContainText(text);
  }

  async expectMissingLinkedFile(title: string, from: string, to: string) {
    const row = this.orphanRow(title);
    await this.expect(row).toContainText('links to');
    await this.expect(row).toContainText('but that file does not exist in the filesystem.');
    for (const filename of [from, to]) {
      await this.expect(row.getByTestId('source-file-pill').filter({ hasText: filename }).filter({ visible: true })).toHaveAttribute('title', filename);
    }
    await this.expect(row.getByText('Previous route', { exact: true }).locator('..')).not.toHaveAttribute('open', '');
  }

  async showPreviousRoute(title: string) {
    await this.orphanRow(title).getByText('Previous route', { exact: true }).click();
  }

  async keepInConfig(title: string) {
    await this.showExplanation(title);
    await this.orphanRow(title).getByRole('checkbox', { name: 'Keep in config', exact: true }).check();
  }

  async expectOrphanListed(title: string) {
    await this.expect(this.orphanRow(title)).toBeVisible();
  }
}
