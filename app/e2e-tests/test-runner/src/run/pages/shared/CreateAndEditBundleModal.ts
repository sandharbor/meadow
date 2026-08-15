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

export class CreateAndEditBundleModal {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  private get moreDetailsToggle() {
    return this.page.locator("button", { hasText: /More details|Hide details/ });
  }

  private get slugDisplay() {
    return this.page.locator("text=Bundle Config Folder Name").locator("..").locator(".bg-gray-50");
  }

  private get slugEditBtn() {
    return this.page.locator("text=Bundle Config Folder Name").locator("..").locator('button[title="Edit manually"]');
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

  async selectFolderEntryStrategy() {
    const option = this.page.getByRole("radio", { name: /One or more folders/ });
    await this.expect(option).toBeVisible();
    await option.click();
    await this.expect(option).toHaveAttribute("aria-checked", "true");
  }

  async addFolders(folderPaths: string[]) {
    await this.page.evaluate((paths) => {
      const target = window as unknown as {
        electronAPI?: Record<string, unknown>;
      };
      target.electronAPI = {
        ...(target.electronAPI || {}),
        showOpenDialog: async () => ({ canceled: false, filePaths: paths }),
      };
    }, folderPaths);
    const button = this.page.getByRole("button", { name: "Add folders" });
    await this.expect(button).toBeVisible();
    await button.click();
  }

  async fillFolderBundleName(name: string) {
    const input = this.page.locator('input[placeholder="Research bundle"]');
    await this.expect(input).toBeVisible();
    await input.fill(name);
  }

  async expectSelectedFolderOrder(folderPaths: string[]) {
    const rows = this.page.getByRole("list", {
      name: "Selected folders in bundle-home order",
    }).locator("li span[title]");
    await this.expect(rows).toHaveCount(folderPaths.length);
    this.expect(await rows.evaluateAll(elements => elements.map(element => element.getAttribute("title"))))
      .toEqual(folderPaths);
  }

  async moveFolderEarlier(folderPath: string) {
    const button = this.page.getByRole("button", {
      name: `Move ${folderPath} earlier`,
    });
    await this.expect(button).toBeEnabled();
    await button.click();
  }

  async showDetails() {
    const toggle = this.page.locator("button", { hasText: "More details" });
    await this.expect(toggle).toBeVisible();
    await toggle.click();
    await this.expect(this.page.locator("text=Bundle Config Folder Name")).toBeVisible();
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

  async fillDefaultTraversalDepths(outlinks: number, inlinks: number) {
    await this.showDetails();
    const outlinksInput = this.page.getByRole("spinbutton", { name: "Default outlink depth" });
    const inlinksInput = this.page.getByRole("spinbutton", { name: "Default inlink depth" });
    await this.expect(outlinksInput).toBeVisible();
    await this.expect(inlinksInput).toBeVisible();
    await outlinksInput.fill(String(outlinks));
    await inlinksInput.fill(String(inlinks));
  }

  async expectSlugConflictError(text: string) {
    await this.expect(this.page.locator(".text-red-600", { hasText: text })).toBeVisible();
  }

  async expectCreateBundleDisabled() {
    const btn = this.page.getByRole("button", { name: "Create Bundle", exact: true });
    await this.expect(btn).toBeDisabled();
  }

  async clickCreateBundle() {
    const btn = this.page.getByRole("button", { name: "Create Bundle", exact: true });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }
}
