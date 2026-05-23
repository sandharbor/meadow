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

export class OrphansModal {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  private get modalTitle() {
    return this.page.locator("h2", { hasText: "Orphaned Pages" });
  }

  private get orphansView() {
    return this.page.getByTestId("orphans-view");
  }

  private get orphanRows() {
    return this.orphansView.locator("tbody tr");
  }

  private orphanRow(title: string) {
    return this.page.getByTestId(`orphan-row-${title}`);
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
    await this.expect(this.removeAllBtn).toBeVisible();
    await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes("/site-config") &&
          r.request().method() === "POST" &&
          r.ok(),
        { timeout: 15_000 },
      ),
      this.removeAllBtn.click(),
    ]);
  }

  async getOrphanCount(): Promise<number> {
    return this.orphanRows.count();
  }

  async expectOrphanCount(count: number) {
    await this.expect(this.orphanRows).toHaveCount(count);
  }

  async expectOrphanListed(title: string) {
    await this.expect(this.orphanRow(title)).toBeVisible();
  }
}
