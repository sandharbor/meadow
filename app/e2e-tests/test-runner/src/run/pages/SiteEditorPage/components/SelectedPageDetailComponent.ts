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

import type { Locator, Expect, Page } from "@playwright/test";

export enum Pill {
  Tracked = "Tracked",
  NotTracked = "Not Tracked",
  Blacklisted = "Blacklisted",
  Sensitive = "Sensitive",
  Frontier = "Frontier",
  FrontierImage = "Frontier Image",
}

export enum ActionButton {
  Track = "Track",
  Blacklist = "Blacklist",
}

/**
 * Represents a single selected-page card inside the SitePageSelectionSidebar.
 * Scoped to a specific `[data-testid="selected-page-<id>"]` element.
 */
export class SelectedPageDetailComponent {
  private root: Locator;

  constructor(
    root: Locator,
    private expect: Expect,
  ) {
    this.root = root;
  }

  // --- Pills ---

  async expectPill(pill: Pill) {
    const loc = this.root
      .locator("span.rounded-full")
      .filter({ hasText: new RegExp(`^${SelectedPageDetailComponent.escapeRegex(pill)}$`) });
    await this.expect(loc).toBeVisible();
  }

  async expectNoPill(pill: Pill) {
    const loc = this.root
      .locator("span.rounded-full")
      .filter({ hasText: new RegExp(`^${SelectedPageDetailComponent.escapeRegex(pill)}$`) });
    await this.expect(loc).not.toBeVisible();
  }

  // --- Action buttons ---

  async expectButtonDisabled(button: ActionButton) {
    const loc = this.root
      .locator("button")
      .filter({ hasText: new RegExp(`^${SelectedPageDetailComponent.escapeRegex(button)}$`) });
    await this.expect(loc).toBeVisible();
    await this.expect(loc).toBeDisabled();
  }

  async expectButtonEnabled(button: ActionButton) {
    const loc = this.root
      .locator("button")
      .filter({ hasText: new RegExp(`^${SelectedPageDetailComponent.escapeRegex(button)}$`) });
    await this.expect(loc).toBeVisible();
    await this.expect(loc).toBeEnabled();
  }

  /**
   * Click an action button (e.g. Track, Blacklist).
   *
   * Track and Blacklist are "simple ops" that auto-save + commit in the
   * backend. Pass the top-level page so we can await the copy-tracked-pages
   * response and avoid relying on fixed sleeps.
   */
  async clickAction(button: ActionButton, page?: Page) {
    const loc = this.root
      .locator("button")
      .filter({ hasText: new RegExp(`^${SelectedPageDetailComponent.escapeRegex(button)}$`) });
    await this.expect(loc).toBeVisible();
    await this.expect(loc).toBeEnabled();
    if (page) {
      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes("/copy-tracked-pages") &&
            r.request().method() === "POST",
          { timeout: 15000 },
        ),
        loc.click(),
      ]);
    } else {
      await loc.click();
    }
  }

  // --- Details toggle ---

  async openDetails() {
    const btn = this.root.locator('button[title="Toggle details"]');
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async clickShowLinks() {
    const btn = this.root.locator("button", { hasText: "Show Links" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  // --- Outlinks depth ---

  private get outlinksDepthInput() {
    return this.root.locator('input[type="number"][placeholder="depth"]').first();
  }

  private get outlinksDepthSetBtn() {
    return this.root.locator("button", { hasText: "Set" }).first();
  }

  async fillOutlinksDepth(depth: number) {
    await this.expect(this.outlinksDepthInput).toBeVisible();
    await this.outlinksDepthInput.fill(String(depth));
  }

  async clickSetOutlinksDepth() {
    await this.expect(this.outlinksDepthSetBtn).toBeVisible();
    await this.outlinksDepthSetBtn.click();
  }

  async setOutlinksDepth(depth: number) {
    await this.fillOutlinksDepth(depth);
    await this.clickSetOutlinksDepth();
  }

  async expectOutlinksDepthInputValue(expected: string) {
    await this.expect(this.outlinksDepthInput).toHaveValue(expected);
  }

  // --- Override edit/remove buttons ---

  private get addOutlinksDepthOverrideBtn() {
    return this.root.locator('button[title="Add outlink depth override"]');
  }

  /**
   * For a non-initial page with no existing outlink depth override: open the
   * override input, fill it, and click Set. This is a "complex op" that
   * leaves the config as an unsaved draft until the user clicks Save.
   */
  async addOutlinksDepthOverride(depth: number) {
    await this.expect(this.addOutlinksDepthOverrideBtn).toBeVisible();
    await this.addOutlinksDepthOverrideBtn.click();
    await this.setOutlinksDepth(depth);
  }

  private get editOutlinksDepthOverrideBtn() {
    return this.root.locator('button[title="Edit outlink depth override"]');
  }

  private get removeOutlinksDepthOverrideBtn() {
    return this.root.locator('button[title="Remove outlink depth override"]');
  }

  private get editInlinksDepthOverrideBtn() {
    return this.root.locator('button[title="Edit inlink depth override"]');
  }

  private get removeInlinksDepthOverrideBtn() {
    return this.root.locator('button[title="Remove inlink depth override"]');
  }

  async expectRemoveOutlinksDepthVisible() {
    await this.expect(this.removeOutlinksDepthOverrideBtn).toBeVisible();
  }

  async expectRemoveOutlinksDepthNotVisible() {
    await this.expect(this.removeOutlinksDepthOverrideBtn).not.toBeVisible();
  }

  async expectRemoveInlinksDepthVisible() {
    await this.expect(this.removeInlinksDepthOverrideBtn).toBeVisible();
  }

  async expectRemoveInlinksDepthNotVisible() {
    await this.expect(this.removeInlinksDepthOverrideBtn).not.toBeVisible();
  }

  async clickEditOutlinksDepthOverride() {
    await this.expect(this.editOutlinksDepthOverrideBtn).toBeVisible();
    await this.editOutlinksDepthOverrideBtn.click();
  }

  async clickEditInlinksDepthOverride() {
    await this.expect(this.editInlinksDepthOverrideBtn).toBeVisible();
    await this.editInlinksDepthOverrideBtn.click();
  }

  // --- Helpers ---

  private static escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
