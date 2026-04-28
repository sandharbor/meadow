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

export class FilterPanelComponent {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  private get addCustomFilterBtn() {
    return this.page.locator('button[title="Add custom filter"]');
  }

  private get createCustomFilterHeading() {
    return this.page.locator("h2", { hasText: "Create Custom Filter" });
  }

  private get filterNameInput() {
    return this.page.locator('input[placeholder="Enter filter name"]');
  }

  private get saveFilterBtn() {
    return this.page.locator("button", { hasText: "Save Filter" });
  }

  private get searchInput() {
    return this.page.locator('input[placeholder="Search"]');
  }

  private filterCheckbox(filterName: string) {
    const escaped = filterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.page.getByRole("checkbox", { name: new RegExp(`^${escaped}(\\s|$)`) });
  }

  async clickAddCustomFilter() {
    await this.expect(this.addCustomFilterBtn).toBeVisible();
    await this.addCustomFilterBtn.click();
    await this.expect(this.createCustomFilterHeading).toBeVisible();
  }

  async fillAndSaveCustomFilter({
    name,
    field,
    matchType,
    value,
  }: {
    name: string;
    field: string;
    matchType: string;
    value: string;
  }) {
    await this.filterNameInput.fill(name);

    const selectorBlock = this.page
      .locator(".p-4.border.border-gray-200")
      .first();
    const selects = selectorBlock.locator("select");
    await selects.nth(0).selectOption(field);
    await selects.nth(1).selectOption(matchType);
    await selectorBlock
      .locator('input[placeholder="Enter search text"]')
      .fill(value);

    await this.saveFilterBtn.click();
    await this.expect(this.createCustomFilterHeading).toBeHidden();
  }

  async enableFilter(filterName: string) {
    const checkbox = this.filterCheckbox(filterName);
    await this.expect(checkbox).toBeVisible();
    await checkbox.check();
  }

  async getFilterThresholdValue(filterName: string): Promise<number> {
    const filterContainer = this.filterCheckbox(filterName).locator("xpath=ancestor::div[contains(@class, 'space-y-2')][1]");
    const input = filterContainer.locator('input[type="number"]');
    await this.expect(input).toBeVisible();
    const value = await input.inputValue();
    return parseInt(value, 10);
  }

  async setFilterThresholdValue(filterName: string, value: number) {
    const filterContainer = this.filterCheckbox(filterName).locator("xpath=ancestor::div[contains(@class, 'space-y-2')][1]");
    const input = filterContainer.locator('input[type="number"]');
    await this.expect(input).toBeVisible();
    await input.fill(String(value));
  }

  async clickSoloOnFilter(filterName: string) {
    const filterRow = this.filterCheckbox(filterName).locator("xpath=ancestor::div[.//button[@title='Solo']][1]");
    await filterRow.locator('button[title="Solo"]').click();
  }

  async enableAndSoloFilter(filterName: string) {
    await this.enableFilter(filterName);
    await this.clickSoloOnFilter(filterName);
  }

  async clickShowTitlesOnFilter(filterName: string) {
    const filterRow = this.filterCheckbox(filterName).locator("xpath=ancestor::div[.//button[@title='Show text labels']][1]");
    await filterRow.locator('button[title="Show text labels"]').click();
  }

  async fillSearch(text: string) {
    await this.expect(this.searchInput).toBeVisible();
    await this.searchInput.fill(text);
  }

  private filterQuestionIcon(filterName: string) {
    // Find the container that has both the label and the ? icon
    return this.page
      .locator(".flex.items-center", { has: this.page.locator("label", { hasText: filterName }) })
      .locator("span.group")
      .first();
  }

  async expectFilterVisible(filterName: string) {
    await this.expect(this.filterCheckbox(filterName)).toBeVisible();
  }

  async hoverFilterQuestionIcon(filterName: string) {
    await this.filterQuestionIcon(filterName).hover();
  }

  async expectFilterTooltipVisible(filterName: string, ...texts: string[]) {
    // Scope to the specific filter's tooltip by finding it within the filter row
    const filterRow = this.page
      .locator(".flex.items-center", { has: this.page.locator("label", { hasText: filterName }) })
      .first();
    for (const text of texts) {
      await this.expect(filterRow.getByText(text)).toBeVisible();
    }
  }
}
