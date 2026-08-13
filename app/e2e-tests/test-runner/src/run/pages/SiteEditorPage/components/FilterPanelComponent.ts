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

  private get mixFiltersBtn() {
    return this.page.getByRole("button", { name: /Mix filters/ });
  }

  private get mixFiltersHeading() {
    return this.page.getByRole("heading", { name: "Mix the filters" });
  }

  private get mixFiltersModal() {
    return this.mixFiltersHeading.locator("xpath=ancestor::div[contains(@class, 'bg-white')][1]");
  }

  private mixTermCard(termName: string) {
    return this.mixFiltersModal
      .locator('[data-testid^="filter:"]')
      .filter({ hasText: termName })
      .first();
  }

  private filterCheckbox(filterName: string) {
    const escaped = filterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.page.getByRole("checkbox", { name: new RegExp(`^${escaped}(\\s|$)`) });
  }

  private filterDisclosure(filterName: string) {
    const escaped = filterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.page.getByRole("button", {
      name: new RegExp(`^(Expand|Collapse) ${escaped}$`),
    });
  }

  private gapDirection(filterName: string): "Outlink" | "Inlink" | null {
    if (filterName === "Outlink Gap") return "Outlink";
    if (filterName === "Inlink Gap") return "Inlink";
    return null;
  }

  private async filterControl(filterName: string) {
    const checkbox = this.filterCheckbox(filterName);
    if (await checkbox.count() > 0) return checkbox;
    return this.filterDisclosure(filterName);
  }

  private folderRow(folderPath: string) {
    return this.page.locator('[data-folder-path]').filter({
      has: this.page.locator(`[title="${folderPath || 'Root'}"]`),
    }).first();
  }

  private nodeTypeRow(typeName: string) {
    return this.page
      .getByTestId("node-type-filter-list")
      .locator(":scope > div")
      .filter({ has: this.page.getByTitle(typeName, { exact: true }) })
      .first();
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
    const gapDirection = this.gapDirection(filterName);
    if (gapDirection) await this.expandFilterGroup("Gap");

    const disclosure = this.filterDisclosure(filterName);
    if (await disclosure.count() > 0) {
      await this.expandFilterGroup(filterName);
      return;
    }

    const checkbox = this.filterCheckbox(filterName);
    await this.expect(checkbox).toBeVisible();
    await checkbox.check();
  }

  async getFilterThresholdValue(filterName: string): Promise<number> {
    const gapDirection = this.gapDirection(filterName);
    if (gapDirection) {
      await this.expandFilterGroup("Gap");
      const input = this.page.getByLabel(`${gapDirection} gap threshold`);
      await this.expect(input).toBeVisible();
      return parseInt(await input.inputValue(), 10);
    }
    const filterContainer = this.filterCheckbox(filterName).locator("xpath=ancestor::div[contains(@class, 'space-y-2')][1]");
    const input = filterContainer.locator('input[type="number"]');
    await this.expect(input).toBeVisible();
    const value = await input.inputValue();
    return parseInt(value, 10);
  }

  async setFilterThresholdValue(filterName: string, value: number) {
    const gapDirection = this.gapDirection(filterName);
    if (gapDirection) {
      await this.expandFilterGroup("Gap");
      const input = this.page.getByLabel(`${gapDirection} gap threshold`);
      await this.expect(input).toBeVisible();
      await input.fill(String(value));
      return;
    }
    const filterContainer = this.filterCheckbox(filterName).locator("xpath=ancestor::div[contains(@class, 'space-y-2')][1]");
    const input = filterContainer.locator('input[type="number"]');
    await this.expect(input).toBeVisible();
    await input.fill(String(value));
  }

  async clickSoloOnFilter(filterName: string) {
    const gapDirection = this.gapDirection(filterName);
    if (gapDirection) {
      await this.expandFilterGroup("Gap");
      await this.page.getByTitle(`Solo ${gapDirection} gaps`).click();
      return;
    }
    const filterRow = this.filterCheckbox(filterName).locator("xpath=ancestor::div[.//button[@title='Solo']][1]");
    await filterRow.locator('button[title="Solo"]').click();
  }

  async getNodeTypeCount(typeName: string): Promise<number> {
    await this.expandFilterGroup("Types");
    const count = this.nodeTypeRow(typeName).locator('span[title$=" node"], span[title$=" nodes"]');
    await this.expect(count).toBeVisible();
    return parseInt(await count.innerText(), 10);
  }

  async soloNodeType(typeName: string) {
    await this.expandFilterGroup("Types");
    const button = this.nodeTypeRow(typeName).getByTitle(`Solo ${typeName}`, { exact: true });
    await this.expect(button).toBeVisible();
    await button.click();
    await this.expect(button).toHaveAttribute("aria-pressed", "true");
  }

  async enableAndSoloFilter(filterName: string) {
    await this.enableFilter(filterName);
    await this.clickSoloOnFilter(filterName);
  }

  async expectMixFiltersHidden() {
    await this.expect(this.mixFiltersBtn).toHaveCount(0);
  }

  async openMixFilters() {
    await this.expect(this.mixFiltersBtn).toBeVisible();
    await this.mixFiltersBtn.click();
    await this.expect(this.mixFiltersHeading).toBeVisible();
  }

  async moveMixFiltersBy(deltaX: number, deltaY: number) {
    const panel = this.page.getByTestId("movable-modal-panel");
    const titleBar = this.page.getByTestId("movable-modal-title-bar");
    await this.expect(panel).toBeVisible();
    await this.expect(titleBar).toBeVisible();

    const before = await panel.boundingBox();
    const handle = await titleBar.boundingBox();
    if (!before || !handle) throw new Error("Mix filters modal geometry is unavailable");
    await this.page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(
      handle.x + handle.width / 2 + deltaX,
      handle.y + handle.height / 2 + deltaY,
      { steps: 5 },
    );
    await this.page.mouse.up();

    const after = await panel.boundingBox();
    if (!after) throw new Error("Moved Mix filters modal geometry is unavailable");
    this.expect(after.x).toBeCloseTo(before.x + deltaX, 0);
    this.expect(after.y).toBeCloseTo(before.y + deltaY, 0);
  }

  async expectMixFiltersCustomized(customized: boolean) {
    const indicator = this.mixFiltersBtn.getByTestId("mix-filters-customized-indicator");
    if (customized) {
      await this.expect(indicator).toHaveText("Customized");
    } else {
      await this.expect(indicator).toHaveCount(0);
    }
  }

  async expectMixFiltersLeftAlignedWithAddCustomFilterOnRight() {
    await this.expect(this.mixFiltersBtn).toBeInViewport();

    const actionsRow = this.page.getByTestId("filter-actions-row");
    const [rowBox, mixBox, addBox] = await Promise.all([
      actionsRow.boundingBox(),
      this.mixFiltersBtn.boundingBox(),
      this.addCustomFilterBtn.boundingBox(),
    ]);
    if (!rowBox || !mixBox || !addBox) {
      throw new Error("Filter action geometry is unavailable");
    }

    this.expect(mixBox.x).toBeCloseTo(rowBox.x, 0);
    this.expect(addBox.x + addBox.width).toBeCloseTo(rowBox.x + rowBox.width, 0);
    this.expect(mixBox.y + mixBox.height / 2).toBeCloseTo(addBox.y + addBox.height / 2, 0);
  }

  async chooseMixOperator(operator: "Any" | "All" | "Without") {
    const button = this.mixFiltersModal.getByRole("button", { name: operator, exact: true });
    await this.expect(button).toBeVisible();
    await button.click();
    await this.expect(button).toHaveAttribute("aria-pressed", "true");
  }

  async resetMixFilters() {
    const button = this.mixFiltersModal.getByRole("button", { name: "Reset mix", exact: true });
    await this.expect(button).toBeVisible();
    await button.click();
  }

  async expectMixTermOrder(termNames: string[]) {
    const cards = this.mixFiltersModal.locator('[data-testid^="filter:"]');
    await this.expect(cards).toHaveCount(termNames.length);
    for (const [index, termName] of termNames.entries()) {
      await this.expect(cards.nth(index)).toContainText(termName);
    }
  }

  async expectDefaultHideAndSoloMix({
    hides,
    solos,
  }: {
    hides: string[];
    solos: string[];
  }) {
    const expectGroup = async (
      groupId: string,
      operator: "Any" | "All",
      termNames: string[],
    ) => {
      const group = this.mixFiltersModal.getByTestId(groupId);
      await this.expect(group).toBeVisible();
      await this.expect(
        group.locator(":scope > div").first().getByRole("button", { name: operator, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      const cards = group.locator('[data-testid^="filter:"]');
      await this.expect(cards).toHaveCount(termNames.length);
      for (const [index, termName] of termNames.entries()) {
        await this.expect(cards.nth(index)).toContainText(termName);
      }
    };

    const root = this.mixFiltersModal.getByTestId("filter-expression-visible");
    await this.expect(root).toBeVisible();
    await this.expect(
      root.locator(":scope > div").first().getByRole("button", { name: "All", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expectGroup("filter-expression-hides", "All", hides);
    await expectGroup("filter-expression-solos", "Any", solos);
  }

  async dragMixTermOnto(sourceName: string, targetName: string) {
    const source = this.mixTermCard(sourceName);
    const target = this.mixTermCard(targetName);
    await this.expect(source).toBeVisible();
    await this.expect(target).toBeVisible();
    await source.dragTo(target);
  }

  async closeMixFilters() {
    const button = this.mixFiltersModal.getByRole("button", { name: "Done", exact: true });
    await this.expect(button).toBeVisible();
    await button.click();
    await this.expect(this.mixFiltersHeading).toBeHidden();
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
    await this.expect(await this.filterControl(filterName)).toBeVisible();
  }

  async expectFolderFilterHidden() {
    await this.expect(this.filterDisclosure("Folders")).toHaveCount(0);
  }

  async expandFilterGroup(filterName: string) {
    const disclosure = this.filterDisclosure(filterName);
    await this.expect(disclosure).toBeVisible();
    if (await disclosure.getAttribute("aria-expanded") !== "true") await disclosure.click();
    await this.expect(disclosure).toHaveAttribute("aria-expanded", "true");
  }

  async collapseFilterGroup(filterName: string) {
    const disclosure = this.filterDisclosure(filterName);
    await this.expect(disclosure).toBeVisible();
    if (await disclosure.getAttribute("aria-expanded") !== "false") await disclosure.click();
    await this.expect(disclosure).toHaveAttribute("aria-expanded", "false");
  }

  async expectFilterGroupActive(filterName: string) {
    await this.expect(this.page.getByTitle(`${filterName} has active settings`)).toBeVisible();
  }

  async expectFilterGroupInactive(filterName: string) {
    await this.expect(this.page.getByTitle(`${filterName} has active settings`)).toHaveCount(0);
  }

  async expectFolderVisible(folderPath: string) {
    await this.expect(this.folderRow(folderPath)).toBeVisible();
  }

  async expectFolderCount(folderPath: string, count: number) {
    const row = this.folderRow(folderPath);
    const countLabel = `${count} ${count === 1 ? 'page' : 'pages'}`;
    await this.expect(row.getByTitle(`${countLabel} in ${folderPath || 'Root'}`)).toHaveText(String(count));
  }

  async expandFolder(folderPath: string) {
    const button = this.page.getByTitle(`Expand folder ${folderPath || 'Root'}`);
    await this.expect(button).toBeVisible();
    await button.click();
  }

  async collapseFolder(folderPath: string) {
    const button = this.page.getByTitle(`Collapse folder ${folderPath || 'Root'}`);
    await this.expect(button).toBeVisible();
    await button.click();
  }

  async soloFolder(folderPath: string) {
    const button = this.page.getByTitle(`Solo folder ${folderPath || 'Root'}`);
    await this.expect(button).toBeVisible();
    await button.click();
  }

  async hideFolder(folderPath: string) {
    const button = this.page.getByTitle(`Hide folder ${folderPath || 'Root'}`);
    await this.expect(button).toBeVisible();
    await button.click();
  }

  async expectDescendantActivity(folderPath: string) {
    await this.expect(this.page.getByTitle(`Active settings in subfolders of ${folderPath}`)).toBeVisible();
  }

  async expectNoDescendantActivity(folderPath: string) {
    await this.expect(this.page.getByTitle(`Active settings in subfolders of ${folderPath}`)).toHaveCount(0);
  }

  async resetFolderFilters() {
    const button = this.page.getByTitle("Reset folder filters");
    await this.expect(button).toBeVisible();
    await button.click();
  }

  async expectFolderResetHidden() {
    await this.expect(this.page.getByTitle("Reset folder filters")).toHaveCount(0);
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
