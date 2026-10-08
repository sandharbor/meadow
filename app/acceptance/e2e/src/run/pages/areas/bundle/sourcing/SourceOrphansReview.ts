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

import type { Locator, Page, Expect } from "@playwright/test";
import type { SourcingWorkspacePage } from "./SourcingWorkspacePage.js";

const pageChangesChip = /^\d+ page changes?$/;
const configurationChip = /^\d+ configuration removals?$/;

/**
 * Saved configuration that acceptance removes. Removed pages show it in their
 * selected-page evidence; configuration that was already unreachable is listed
 * in the tray's configuration removals.
 */
export class SourceOrphansReview {
  /** The removal disclosure and diagnosis of the orphan most recently selected. */
  private details?: Locator;
  private diagnosis?: Locator;

  constructor(
    private page: Page,
    private expect: Expect,
    private workspace: SourcingWorkspacePage,
  ) {}

  private get removedPageRows() {
    return this.workspace.acceptedChangeDetail("Page changes").getByRole("region", { name: "Remove", exact: true })
      .getByTestId("accepted-page-change").filter({ hasText: "Remove configuration" });
  }

  private get configurationRows() {
    return this.page.getByRole("region", { name: "Configuration removals", exact: true }).getByTestId("accepted-configuration-removal");
  }

  private named(rows: Locator, title: string) {
    return rows.filter({ has: this.page.getByText(title, { exact: true }) });
  }

  private async rowsIn(chip: RegExp): Promise<Locator | null> {
    if (!await this.workspace.acceptedChange(chip).count()) return null;
    if (chip === pageChangesChip) {
      await this.workspace.openAcceptedChangeDetail(chip, "Page changes");
      return this.removedPageRows;
    }
    await this.workspace.openAcceptedChangeDetail(chip, "Configuration removals");
    return this.configurationRows;
  }

  private async count(title?: string) {
    let total = 0;
    for (const chip of [pageChangesChip, configurationChip]) {
      const rows = await this.rowsIn(chip);
      if (rows) total += await (title ? this.named(rows, title) : rows).count();
    }
    return total;
  }

  async waitForOpen() {
    await this.expect(this.workspace.acceptedChanges).toBeVisible();
    await this.expect(this.workspace.root.getByText("Loading source proposal…")).toHaveCount(0);
  }

  async close() { await this.workspace.closeAcceptedChangeDetail(); }

  async expectSummaryCount(count: number) {
    await this.expectOrphanCount(count);
  }

  async getOrphanCount(): Promise<number> {
    const count = await this.count();
    await this.close();
    return count;
  }

  async expectOrphanCount(count: number) {
    await this.waitForOpen();
    await this.expect.poll(() => this.count()).toBe(count);
    await this.close();
  }

  async expectOrphanListed(title: string) {
    await this.waitForOpen();
    await this.expect.poll(() => this.count(title)).toBe(1);
    await this.close();
  }

  async expectNotListed(title: string) {
    await this.waitForOpen();
    await this.expect.poll(() => this.count(title)).toBe(0);
    await this.close();
  }

  /** Bring the orphan's removal explanation into view without opening it. */
  async select(title: string) {
    await this.waitForOpen();
    await this.expect.poll(() => this.count(title)).toBe(1);
    const removed = await this.rowsIn(pageChangesChip);
    if (removed && await this.named(removed, title).count()) {
      await this.named(removed, title).click();
      await this.expect(this.workspace.acceptedChangeDetail("Page changes")).toBeHidden();
      await this.expect(this.workspace.selectedPage).toContainText(title);
      await this.expect(this.workspace.evidence).toContainText("Change: Remove");
      this.details = this.workspace.evidence.locator("details");
      this.diagnosis = this.workspace.evidence.getByTestId("source-orphan-diagnosis");
      return;
    }
    const configuration = await this.rowsIn(configurationChip);
    this.expect(configuration).not.toBeNull();
    const row = this.named(configuration!, title);
    await this.expect(row).toHaveCount(1);
    this.details = row;
    this.diagnosis = row.getByTestId("source-orphan-diagnosis");
  }

  async expectCollapsedFile(title: string) {
    await this.select(title);
    await this.expect(this.details!).not.toHaveAttribute("open", "");
    await this.expect(this.diagnosis!).not.toBeVisible();
  }

  async toggleExplanationWithKeyboard(_title: string) {
    const wasOpen = await this.details!.getAttribute("open") !== null;
    const summary = this.details!.locator("summary").first();
    await summary.focus();
    await summary.press("Enter");
    await this.expect(this.diagnosis!).toBeVisible({ visible: !wasOpen });
  }

  async showExplanation(title: string) {
    await this.select(title);
    if (await this.details!.getAttribute("open") === null) await this.details!.locator("summary").first().click();
    await this.expect(this.diagnosis!).toBeVisible();
  }

  async expectExplanation(_title: string, text: string) {
    await this.expect(this.diagnosis!).toContainText(text);
  }

  async expectMissingLinkedFile(_title: string, from: string, to: string) {
    await this.expect(this.diagnosis!).toContainText("links to");
    await this.expect(this.diagnosis!).toContainText("but that file does not exist in the filesystem.");
    for (const filename of [from, to]) {
      await this.expect(this.diagnosis!.getByTestId("source-file-pill").filter({ hasText: filename }).filter({ visible: true })).toHaveAttribute("title", filename);
    }
  }
}
