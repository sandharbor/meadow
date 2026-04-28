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

export class SiteListPage {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  private get sitesHeading() {
    return this.page.locator("h1", { hasText: "Sites" });
  }

  private siteRow(name: string) {
    return this.page.locator("tr", { hasText: name });
  }

  async goto() {
    await this.page.goto("/");
    await this.expect(this.sitesHeading).toBeVisible();
  }

  async expectHeadingVisible() {
    await this.expect(this.sitesHeading).toBeVisible();
  }

  async clickSite(name: string) {
    await this.expect(this.siteRow(name)).toBeVisible();
    await this.siteRow(name).click();
  }

  async clickCreateSiteLink() {
    const btn = this.page.locator("button", { hasText: "create a site" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async clickCreateSiteForPage() {
    const btn = this.page.locator("button", { hasText: "Create Site for Page" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async clickAddExampleSiteLink() {
    const btn = this.page.locator("button", { hasText: "add the example site" });
    await this.expect(btn).toBeVisible();
    await btn.click();
    const confirmBtn = this.page.locator("button", { hasText: "Let's try it!" });
    await this.expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
  }

  async addExampleSiteFromMenu() {
    const menuBtn = this.page.locator("button", { hasText: "⋯" }).first();
    await this.expect(menuBtn).toBeVisible();
    await menuBtn.click();
    const addBtn = this.page.locator("button", { hasText: "Add Example Site" });
    await this.expect(addBtn).toBeVisible();
    await addBtn.click();
    const confirmBtn = this.page.locator("button", { hasText: "Let's try it!" });
    await this.expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
  }

  async clickDeleteSite(name: string) {
    await this.expect(this.siteRow(name)).toBeVisible();
    const deleteBtn = this.siteRow(name).locator('button[title="Delete site"]');
    await this.expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
  }

  async expectDeleteModalVisible() {
    await this.expect(
      this.page.getByText("Everything about this site will be deleted"),
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

  async waitForSiteGone(name: string) {
    await this.expect(this.siteRow(name)).not.toBeVisible({ timeout: 30_000 });
  }

  async expectSiteVisible(name: string) {
    await this.expect(this.siteRow(name)).toBeVisible();
  }

  async expectSiteNotVisible(name: string) {
    await this.expect(this.siteRow(name)).not.toBeVisible();
  }

  async expectCalloutVisible(text: string) {
    await this.expect(this.page.getByText(text)).toBeVisible();
  }

  async archiveSite(name: string) {
    await this.expect(this.siteRow(name)).toBeVisible();
    const archiveBtn = this.siteRow(name).locator('button[title="Archive site"]');
    await this.expect(archiveBtn).toBeVisible();
    await archiveBtn.click();
  }

  async clickArchivedTab() {
    const tab = this.page.locator("button", { hasText: "Archived Sites" });
    await this.expect(tab).toBeVisible();
    await tab.click();
  }

  async expectArchivedTabBadge(count: number) {
    const tab = this.page.locator("button", { hasText: "Archived Sites" });
    const badge = tab.locator("span.rounded-full");
    await this.expect(badge).toBeVisible();
    await this.expect(badge).toHaveText(String(count));
  }

  async expectFindInSitesFilterActive(pageName: string) {
    await this.expect(
      this.page.getByText(`Find in sites filter: "${pageName}"`),
    ).toBeVisible();
  }
}
