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

// ---------------------------------------------------------------------------
// Hook — represents a single hook row in the Hooks section
// ---------------------------------------------------------------------------

class Hook {
  constructor(
    private page: Page,
    private expect: Expect,
    private label: string,
  ) {}

  // --- Locators ---

  private get row() {
    const labelEl = this.page.getByText(this.label, { exact: true });
    return labelEl.locator("xpath=ancestor::div[contains(@class, 'grid')]");
  }

  /** The Global column button (first button in the row). */
  private get globalCell() {
    return this.row.locator("button").first();
  }

  /** The Site column button (last button in the row). */
  private get siteCell() {
    return this.row.locator("button").last();
  }

  private get textarea() {
    return this.page.locator("textarea").last();
  }

  private get saveBtn() {
    return this.page.getByRole("button", { name: "Save", exact: true });
  }

  private get closeBtn() {
    return this.page.locator("button[title='Close']");
  }

  // --- Actions ---

  /** Click the Global column cell to open the global hook editor. */
  async clickEdit() {
    const labelEl = this.page.getByText(this.label, { exact: true });
    await labelEl.scrollIntoViewIfNeeded();
    await this.globalCell.click();
  }

  /** Click the Site column cell to open the site hook editor (creates with template if new). */
  async clickCreate() {
    const labelEl = this.page.getByText(this.label, { exact: true });
    await labelEl.scrollIntoViewIfNeeded();
    await this.siteCell.click();
  }

  /** Replace text in the hook editor textarea. */
  async modifyContent(oldText: string, newText: string) {
    await this.expect(this.textarea).toBeVisible();
    const content = await this.textarea.inputValue();
    await this.textarea.fill(content.replace(oldText, newText));
  }

  /** Replace the entire hook editor textarea content. */
  async setContent(newContent: string) {
    await this.expect(this.textarea).toBeVisible();
    await this.textarea.fill(newContent);
  }

  /** Save the hook. */
  async save() {
    await this.expect(this.saveBtn).toBeEnabled();
    await this.saveBtn.click();
    await this.page.waitForTimeout(1000);
  }

  /** Close the floating editor. */
  async close() {
    await this.closeBtn.click();
  }
}

// ---------------------------------------------------------------------------
// HooksSection — the Hooks ConfigSection with scope toggle and hook rows
// ---------------------------------------------------------------------------

class HooksSection {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  // --- Locators ---

  private get heading() {
    return this.page.locator('.font-medium:text-is("Hooks")');
  }

  // --- Actions ---

  /** No-op: unified grid replaces scope tabs. Scrolls to heading for visibility. */
  async switchScopeToGlobal() {
    await this.heading.scrollIntoViewIfNeeded();
  }

  /** Get a hook object by its label (e.g. "Page Title"). */
  getHook(label: string): Hook {
    return new Hook(this.page, this.expect, label);
  }
}

// ---------------------------------------------------------------------------
// GenerationOptionsSection — breadcrumbs, backlinks, etc.
// ---------------------------------------------------------------------------

class GenerationOptionsSection {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  /** Get the Site column HoverSelect combobox for a named setting row. */
  private settingSiteCombobox(name: string) {
    const row = this.page.locator("span", { hasText: name }).locator("xpath=ancestor::div[contains(@class, 'grid')]");
    // Site column is the last combobox in the row (Global is first)
    return row.locator('[role="combobox"]').last();
  }

  /** Select an option from a HoverSelect dropdown by clicking the combobox then the option label. */
  private async selectHoverOption(name: string, optionLabel: string) {
    const combobox = this.settingSiteCombobox(name);
    await combobox.scrollIntoViewIfNeeded();
    await combobox.click();
    // Click the option button in the dropdown
    const dropdown = this.page.locator("div.absolute.bg-white.border.shadow-lg");
    await this.expect(dropdown).toBeVisible();
    await dropdown.locator("button", { hasText: optionLabel }).click();
  }

  /** Set the Breadcrumbs site-level setting to "Off" (disabled). */
  async disableBreadcrumbs() {
    await this.selectHoverOption("Breadcrumbs", "Off");
  }

  /** Set the Backlinks site-level setting to "Off" (disabled). */
  async disableBacklinks() {
    await this.selectHoverOption("Backlinks", "Off");
  }

  /** Set the Markdown ZIP site-level setting to "On" (enabled). */
  async enableMarkdownZip() {
    await this.selectHoverOption("Markdown ZIP", "On");
  }
}

// ---------------------------------------------------------------------------
// CustomizeTab — top-level component, exposes nested sections
// ---------------------------------------------------------------------------

/**
 * Component for the Customize tab within the PreviewPublishModal.
 * Exposes nested section objects for hooks and publish options.
 */
export class CustomizeTab {
  readonly hooks: HooksSection;
  readonly generationOptions: GenerationOptionsSection;

  constructor(page: Page, expect: Expect) {
    this.hooks = new HooksSection(page, expect);
    this.generationOptions = new GenerationOptionsSection(page, expect);
  }
}
