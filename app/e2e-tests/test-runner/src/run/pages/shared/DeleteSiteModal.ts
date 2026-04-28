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

/**
 * Page object for the shared Delete Site confirmation modal.
 *
 * This modal appears when deleting a site from either the SiteList
 * (trash icon) or the SiteEditor (site options menu → Delete site).
 */
export class DeleteSiteModal {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  async expectVisible() {
    await this.expect(
      this.page.getByText("Everything about this site will be deleted"),
    ).toBeVisible();
  }

  async expectPublishedWarningVisible() {
    await this.expect(
      this.page.getByText("Both local files and published files on the web will be deleted"),
    ).toBeVisible();
  }

  async confirmDelete() {
    const deleteBtn = this.page.locator("button", { hasText: "Delete" }).last();
    await this.expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
  }
}
