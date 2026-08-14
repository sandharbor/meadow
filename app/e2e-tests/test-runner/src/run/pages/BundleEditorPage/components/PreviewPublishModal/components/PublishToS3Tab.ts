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
 * Page object for the S3PublishingProvider's publish tab. Exposes the
 * slug-configuration surface + publish button so e2e tests can exercise
 * the S3 provider directly.
 */
export class PublishToS3Tab {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  private get tabButton() {
    return this.page.locator("nav button", { hasText: "Publish to S3" });
  }

  private get slugInput() {
    return this.page.getByTestId("s3-publish-slug-input");
  }

  private get saveSlugBtn() {
    return this.page.getByTestId("s3-save-slug");
  }

  private get publishBtn() {
    return this.page.getByTestId("s3-publish-button");
  }

  private get publishSuccess() {
    return this.page.getByTestId("s3-publish-success");
  }

  private get publishError() {
    return this.page.getByTestId("s3-publish-error");
  }

  async expectVisible() {
    await this.expect(this.tabButton).toBeVisible({ timeout: 30_000 });
    await this.expect(this.page.getByTestId("s3-publish-tab")).toBeVisible({ timeout: 30_000 });
  }

  async setPublishSlug(value: string) {
    await this.expect(this.slugInput).toBeVisible();
    await this.slugInput.fill(value);
    await this.expect(this.saveSlugBtn).toBeEnabled();
    await this.saveSlugBtn.click();
    // After save the button text flips back to "Saved" and becomes disabled.
    await this.expect(this.saveSlugBtn).toHaveText("Saved");
  }

  async clickPublish() {
    await this.expect(this.publishBtn).toBeEnabled();
    await this.publishBtn.click();
  }

  async expectPublishSuccess(): Promise<string> {
    await this.expect(this.publishSuccess).toBeVisible({ timeout: 30_000 });
    const text = (await this.publishSuccess.textContent()) ?? "";
    const match = text.match(/Published to (http[^\s]+)/);
    if (!match) {
      throw new Error(`Could not parse published URL from: ${text}`);
    }
    return match[1];
  }

  async expectNoError() {
    await this.expect(this.publishError).not.toBeVisible();
  }

  // ---------------------------------------------------------------------------
  // Settings dropdown + delete published files
  // ---------------------------------------------------------------------------

  private get settingsButton() {
    return this.page.getByTestId("s3-settings-button");
  }

  private get deletePublishedOption() {
    return this.page.getByTestId("s3-delete-published-option");
  }

  private get deleteConfirm() {
    return this.page.getByTestId("s3-delete-confirm");
  }

  private get deleteConfirmButton() {
    return this.page.getByTestId("s3-delete-confirm-button");
  }

  private get deleteStatus() {
    return this.page.getByTestId("s3-delete-status");
  }

  /** Open the gear-icon settings dropdown. */
  async openSettingsDropdown() {
    await this.expect(this.settingsButton).toBeVisible();
    await this.settingsButton.click();
    await this.expect(this.deletePublishedOption).toBeVisible();
  }

  /** From the open dropdown, click the delete option (opens the confirm dialog). */
  async clickDeletePublished() {
    await this.expect(this.deletePublishedOption).toBeEnabled();
    await this.deletePublishedOption.click();
    await this.expect(this.deleteConfirm).toBeVisible();
  }

  /** Click "Delete All" in the confirm dialog and wait for the delete to complete. */
  async confirmDelete() {
    await this.expect(this.deleteConfirmButton).toBeVisible();
    await this.deleteConfirmButton.click();
    // Confirm dialog closes immediately; status message may show briefly.
    await this.expect(this.deleteConfirm).not.toBeVisible();
    await this.expect(this.deleteStatus).not.toBeVisible({ timeout: 30_000 });
  }
}
