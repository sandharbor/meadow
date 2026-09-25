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
    return this.page.getByText("Bundle Name *", { exact: true }).locator("..").locator(".bg-gray-50");
  }

  private get slugEditBtn() {
    return this.page.getByRole("button", { name: "Edit bundle name" });
  }

  private get slugInput() {
    return this.page.locator('input[title="Only lowercase letters, numbers, and dashes allowed"]');
  }

  async fillSourceDirectory(dirPath: string) {
    const input = this.page.locator('input[placeholder="Enter a custom directory path"]');
    await this.expect(input).toBeVisible();
    await input.fill(dirPath);
  }

  async changeSourceDirectory(dirPath: string) {
    if (!await this.page.getByPlaceholder("Enter a custom directory path").isVisible()) {
      await this.page.getByTitle("Choose a different folder", { exact: true }).click();
    }
    await this.fillSourceDirectory(dirPath);
  }

  async expectFolderOutsideRoot(folderPath: string) {
    const row = this.page.getByRole("listitem").filter({ has: this.page.getByTitle(folderPath, { exact: true }) });
    await this.expect(row.getByRole("alert")).toHaveText("This folder is outside the Notes Root. Choose the root itself or one of its subfolders.");
    await row.scrollIntoViewIfNeeded();
    await this.expectCreateBundleDisabled();
  }

  async expectCreateDisabledTooltip() {
    const wrapper = this.page.getByRole("button", { name: "Create Bundle", exact: true }).locator("..");
    await wrapper.hover();
    const tooltip = wrapper.getByText("Fix the highlighted folders or change the Notes Root before creating the bundle.", { exact: true });
    await this.expect(tooltip).toBeVisible();
    await this.expect(tooltip).toHaveCSS("opacity", "1");
  }

  async expectFolderSelectionValid() {
    await this.expect(this.page.getByRole("button", { name: "Create Bundle", exact: true })).toBeEnabled();
    await this.expect(this.page.getByRole("alert")).toHaveCount(0);
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
      const originalAPI = target.electronAPI;
      target.electronAPI = {
        ...originalAPI,
        showOpenDialog: async () => {
          target.electronAPI = originalAPI;
          return { canceled: false, filePaths: paths };
        },
      };
    }, folderPaths);
    const button = this.page.getByRole("button", { name: "Add folders" });
    await this.expect(button).toBeVisible();
    await button.click();
  }

  async expectFolderSelectionBeforeNaming() {
    const folders = this.page.getByRole("button", { name: "Add folders" });
    await this.expect(folders).toBeVisible();
    await this.expect(this.slugDisplay).toBeVisible();
    const foldersBounds = await folders.boundingBox();
    const nameBounds = await this.slugDisplay.boundingBox();
    this.expect(foldersBounds).not.toBeNull();
    this.expect(nameBounds).not.toBeNull();
    this.expect(foldersBounds!.y + foldersBounds!.height).toBeLessThan(nameBounds!.y);
  }

  async fillFolderHomePageTitle(name: string) {
    const input = this.page.getByRole("textbox", { name: "Home Page Title" });
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
    await this.expect(this.page.getByPlaceholder("Enter any notes about this bundle...")).toBeVisible();
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
