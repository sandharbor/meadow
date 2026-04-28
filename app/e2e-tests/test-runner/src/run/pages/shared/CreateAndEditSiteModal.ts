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

export class CreateAndEditSiteModal {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  private get moreDetailsToggle() {
    return this.page.locator("button", { hasText: /More details|Hide details/ });
  }

  private get slugDisplay() {
    return this.page.locator("text=Site Config Folder Name").locator("..").locator(".bg-gray-50");
  }

  private get slugEditBtn() {
    return this.page.locator("text=Site Config Folder Name").locator("..").locator('button[title="Edit manually"]');
  }

  private get slugInput() {
    return this.page.locator('input[title="Only lowercase letters, numbers, and dashes allowed"]');
  }

  async fillSourceDirectory(dirPath: string) {
    const input = this.page.locator('input[placeholder="Enter a custom directory path"]');
    await this.expect(input).toBeVisible();
    await input.fill(dirPath);
  }

  async typeInitialPageTitle(title: string) {
    const input = this.page.locator('input[placeholder="Type to search…"]');
    await this.expect(input).toBeVisible();
    await input.fill(title);
  }

  async selectSuggestion(title: string) {
    // Ensure the title input is focused — suggestions only render when focused
    const input = this.page.locator('input[placeholder="Type to search…"]');
    await input.click();
    const suggestion = this.page.locator(".bg-gray-50 button").filter({ hasText: new RegExp(`^${title}`) });
    await this.expect(suggestion).toBeVisible();
    await suggestion.click();
  }

  async showDetails() {
    const toggle = this.page.locator("button", { hasText: "More details" });
    await this.expect(toggle).toBeVisible();
    await toggle.click();
    await this.expect(this.page.locator("text=Site Config Folder Name")).toBeVisible();
  }

  async getSlugDisplayText(): Promise<string> {
    await this.expect(this.slugDisplay).toBeVisible();
    return (await this.slugDisplay.textContent()) ?? '';
  }

  async clickEditSlug() {
    await this.expect(this.slugEditBtn).toBeVisible();
    await this.slugEditBtn.click();
  }

  async fillSlug(value: string) {
    await this.expect(this.slugInput).toBeVisible();
    await this.slugInput.fill(value);
  }

  async expectSlugConflictError(text: string) {
    await this.expect(this.page.locator(".text-red-600", { hasText: text })).toBeVisible();
  }

  async expectCreateSiteDisabled() {
    const btn = this.page.getByRole("button", { name: "Create Site", exact: true });
    await this.expect(btn).toBeDisabled();
  }

  async clickCreateSite() {
    const btn = this.page.getByRole("button", { name: "Create Site", exact: true });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }
}
