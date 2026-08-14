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

export class BundleListPage {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  private get bundlesHeading() {
    return this.page.locator("h1", { hasText: "Bundles" });
  }

  private bundleRow(name: string) {
    return this.page.locator("tr", { hasText: name });
  }

  private async openBundleActions(name: string) {
    const row = this.bundleRow(name);
    await this.expect(row).toBeVisible();
    const menuBtn = row.getByRole("button", { name: `More actions for ${name}` });
    await this.expect(menuBtn).toBeVisible();
    await menuBtn.click();
  }

  async goto() {
    await this.page.goto("/");
    await this.expect(this.bundlesHeading).toBeVisible();
  }

  async expectHeadingVisible() {
    await this.expect(this.bundlesHeading).toBeVisible();
  }

  async clickBundle(name: string) {
    await this.expect(this.bundleRow(name)).toBeVisible();
    await this.bundleRow(name).click();
  }

  async clickCreateBundleLink() {
    const btn = this.page.locator("button", { hasText: "create a bundle" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async clickCreateBundleForPage() {
    const btn = this.page.locator("button", { hasText: "Create Bundle for Page" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async clickAddExampleBundleLink() {
    const btn = this.page.locator("button", { hasText: "add the example bundle" });
    await this.expect(btn).toBeVisible();
    await btn.click();
    const confirmBtn = this.page.locator("button", { hasText: "Let's try it!" });
    await this.expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
  }

  async addExampleBundleFromMenu() {
    const menuBtn = this.page.getByRole("button", { name: "More bundle options" });
    await this.expect(menuBtn).toBeVisible();
    await menuBtn.click();
    const addBtn = this.page.locator("button", { hasText: "Add Example Bundle" });
    await this.expect(addBtn).toBeVisible();
    await addBtn.click();
    const confirmBtn = this.page.locator("button", { hasText: "Let's try it!" });
    await this.expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
  }

  async clickDeleteBundle(name: string) {
    await this.openBundleActions(name);
    const deleteBtn = this.page.getByRole("button", { name: "Delete bundle", exact: true });
    await this.expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
  }

  async expectDeleteModalVisible() {
    await this.expect(
      this.page.getByText("Everything about this bundle will be deleted"),
    ).toBeVisible();
  }

  async expectPublishedDeleteWarningVisible() {
    await this.expect(
      this.page.getByText("Both local files and published files on the web will be deleted"),
    ).toBeVisible();
  }

  async confirmDelete() {
    const deleteBtn = this.page.locator("button", { hasText: "Delete" }).last();
    await this.expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
  }

  async waitForBundleGone(name: string) {
    await this.expect(this.bundleRow(name)).not.toBeVisible({ timeout: 30_000 });
  }

  async expectBundleVisible(name: string) {
    await this.expect(this.bundleRow(name)).toBeVisible();
  }

  async expectBundleNotVisible(name: string) {
    await this.expect(this.bundleRow(name)).not.toBeVisible();
  }

  async expectCalloutVisible(text: string) {
    await this.expect(this.page.getByText(text)).toBeVisible();
  }

  async archiveBundle(name: string) {
    await this.openBundleActions(name);
    const archiveBtn = this.page.getByRole("button", { name: "Archive bundle", exact: true });
    await this.expect(archiveBtn).toBeVisible();
    await archiveBtn.click();
  }

  async clickArchivedTab() {
    const tab = this.page.locator("button", { hasText: "Archived Bundles" });
    await this.expect(tab).toBeVisible();
    await tab.click();
  }

  async expectArchivedTabBadge(count: number) {
    const tab = this.page.locator("button", { hasText: "Archived Bundles" });
    const badge = tab.locator("span.rounded-full");
    await this.expect(badge).toBeVisible();
    await this.expect(badge).toHaveText(String(count));
  }

  async expectFindInBundlesFilterActive(pageName: string) {
    await this.expect(
      this.page.getByText(`Find in bundles filter: "${pageName}"`),
    ).toBeVisible();
  }
}
