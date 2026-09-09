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
    return this.page.getByRole("dialog", { name: "Source review" });
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

  private get removeAllBtn() {
    return this.page.getByTestId("remove-all-orphans");
  }

  async waitForOpen() {
    await this.expect(this.modalTitle).toBeVisible();
    await this.expect(this.orphansView).toBeVisible();
  }

  async expectClosed() {
    await this.expect(this.modalTitle).not.toBeVisible();
  }

  async clickRemoveAllFromConfig() {
    await this.expect(this.removeAllBtn).toHaveText('Remove all from config');
    await this.removeAllBtn.click();
  }

  async expectSummaryCount(count: number) {
    await this.expect(this.modalTitle.getByTestId('source-orphans')).toContainText(`Orphaned configuration (${count})`);
  }

  async expectNotListed(title: string) {
    await this.expect(this.orphanRow(title)).toHaveCount(0);
  }

  async removeFromConfig(title: string) {
    await this.orphanRow(title).getByRole('button', { name: 'Remove from config', exact: true }).click();
    await this.expect(this.orphanRow(title).getByRole('button', { name: 'Keep in config', exact: true })).toBeVisible();
  }

  async keepInConfig(title: string) {
    await this.orphanRow(title).getByRole('button', { name: 'Keep in config', exact: true }).click();
    await this.expect(this.orphanRow(title).getByRole('button', { name: 'Remove from config', exact: true })).toBeVisible();
  }

  async expectAllRemovalsPending() {
    await this.expect(this.removeAllBtn).toHaveText('Keep all in config');
  }

  async keepAllInConfig() {
    await this.expectAllRemovalsPending();
    await this.removeAllBtn.click();
    await this.expect(this.removeAllBtn).toHaveText('Remove all from config');
  }

  async getOrphanCount(): Promise<number> {
    return this.orphanRows.count();
  }

  async expectOrphanCount(count: number) {
    await this.expect(this.orphanRows).toHaveCount(count);
  }

  async showExplanation(title: string) {
    await this.orphanRow(title).getByText('Why is this orphaned?', { exact: true }).click();
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

  async expectOrphanListed(title: string) {
    await this.expect(this.orphanRow(title)).toBeVisible();
  }
}
