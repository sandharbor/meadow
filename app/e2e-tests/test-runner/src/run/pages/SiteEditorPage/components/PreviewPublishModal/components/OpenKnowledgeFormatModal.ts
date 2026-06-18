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

import type { Page, Expect, Locator } from "@playwright/test";

export class OpenKnowledgeFormatModal {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  private get heading() {
    return this.page.getByRole("heading", { name: "Open Knowledge Format Settings" });
  }

  private get root() {
    return this.page.locator("div.fixed.inset-0.bg-black").filter({ has: this.heading }).last();
  }

  private get enableButton() {
    return this.root.getByRole("button", { name: "Enable OKF" });
  }

  private get saveButton() {
    return this.root.getByRole("button", { name: "Save Settings" });
  }

  async expectVisible() {
    await this.expect(this.heading).toBeVisible();
  }

  async save() {
    const enableButton = this.enableButton;
    if (await enableButton.isVisible()) {
      await enableButton.click();
      await this.expect(enableButton).toBeHidden({ timeout: 15_000 });
      return;
    }

    const saveButton = this.saveButton;
    await this.expect(saveButton).toBeVisible();
    await saveButton.click();
    await this.expect(saveButton).toBeHidden({ timeout: 15_000 });
  }

  async expectAutomaticLog(pageTitle: string, directoryLabel: string) {
    await this.expect(this.root.getByText(`Uses ${pageTitle} (${directoryLabel})`)).toBeVisible();
  }

  async expectNoReachableLogPageFound() {
    await this.expect(this.root.getByText("No reachable log.md page was found")).toBeVisible();
  }

  async expectSelectedIndex(pageTitle: string, directoryLabel: string) {
    await this.expect(this.root.getByText(`Selected index.md source: ${pageTitle} (${directoryLabel})`)).toBeVisible();
  }

  async chooseGeneratedIndex() {
    await this.root.locator("label", { hasText: "Generated index" }).click();
    await this.expect(this.root.locator("input[name='okf-index-mode']").first()).toBeChecked();
  }

  async chooseIndexPage(pageTitle: string, query = pageTitle) {
    await this.root.locator("label", { hasText: "Use a tracked page as index.md" }).click();
    await this.searchAndSelectPage("okf-index-page-search", query, pageTitle);
    await this.expect(this.root.getByText(`Selected index.md source: ${pageTitle}`)).toBeVisible();
  }

  async chooseLogPage(pageTitle: string, query = pageTitle) {
    await this.root.locator("label", { hasText: "Use a tracked page as log.md" }).click();
    await this.searchAndSelectPage("okf-log-page-search", query, pageTitle);
    await this.expect(this.root.getByText(`Selected log.md source: ${pageTitle}`)).toBeVisible();
  }

  async chooseNoLog() {
    await this.root.locator("label", { hasText: "Do not include log.md" }).click();
    await this.expect(this.root.locator("input[name='okf-log-mode']").last()).toBeChecked();
  }

  async expectLogPageNotSuggested(pageTitle: string, query = pageTitle) {
    await this.root.locator("label", { hasText: "Use a tracked page as log.md" }).click();
    const searchInput = this.root.locator("#okf-log-page-search");
    await this.expect(searchInput).toBeVisible();
    await searchInput.fill(query);
    const picker = this.pickerForSearchInput(searchInput);
    await this.expect(picker.getByText("Loading pages...")).toBeHidden({ timeout: 15_000 });
    await this.expect(picker.locator("button", { hasText: pageTitle })).toHaveCount(0);
  }

  private async searchAndSelectPage(inputId: string, query: string, pageTitle: string) {
    const searchInput = this.root.locator(`#${inputId}`);
    await this.expect(searchInput).toBeVisible();
    await searchInput.fill(query);
    const picker = this.pickerForSearchInput(searchInput);
    const option = picker.locator("button", { hasText: pageTitle });
    await this.expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
  }

  private pickerForSearchInput(searchInput: Locator) {
    return searchInput.locator("xpath=ancestor::div[contains(@class, 'mt-3')][1]");
  }
}
