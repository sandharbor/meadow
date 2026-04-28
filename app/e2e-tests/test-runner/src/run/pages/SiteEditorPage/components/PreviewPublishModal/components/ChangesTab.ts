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
// FileDetailsViewer — the file detail panel shown when clicking a file
// ---------------------------------------------------------------------------

/**
 * Component for the file details viewer within the Changes tab.
 * Handles the diff/whole tabs, code/text sub-tabs, and diff stats header.
 */
class FileDetailsViewer {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  // --- Locators ---

  private get diffTabBtn() {
    return this.page.locator("button", { hasText: "Diff" }).first();
  }

  private get wholeTabBtn() {
    return this.page.locator("button", { hasText: "Whole" }).first();
  }

  private get codeSubTabBtn() {
    return this.page.locator('button[title="Show raw HTML code diff"]');
  }

  private get textSubTabBtn() {
    return this.page.locator('button[title="Show rendered text changes (plain text diff)"]');
  }

  private get statsHeader() {
    return this.page.locator(".bg-neutral-50.border-b .text-sm.text-neutral-600").last();
  }

  // --- Actions ---

  /** Click the Diff tab if not already active. */
  async ensureOnDiffTab() {
    await this.expect(this.diffTabBtn).toBeVisible();
    await this.diffTabBtn.click();
  }

  /** Click the "Code" sub-tab in the HTML diff view toggle. */
  async clickCodeSubTab() {
    await this.expect(this.codeSubTabBtn).toBeVisible();
    await this.codeSubTabBtn.click();
  }

  /** Assert the stats header shows "New file:" text. */
  async expectNewFileHeader() {
    await this.expect(this.statsHeader).toContainText("New file");
  }

  /** Assert the stats header shows "Changes:" text (not "New file:"). */
  async expectChangesHeader() {
    await this.expect(this.statsHeader).toContainText("Changes");
    await this.expect(this.statsHeader).not.toContainText("New file");
  }

  /** Assert the diff panel contains the given text. */
  async expectDiffContainsText(text: string) {
    await this.expect(this.page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
  }
}

// ---------------------------------------------------------------------------
// ChangesTab — top-level component
// ---------------------------------------------------------------------------

/**
 * Component for the Changes tab within the PreviewPublishModal.
 * Covers the changed-files list, HTML section changes filter, and
 * file-status assertions (modified, new, deleted).
 */
export class ChangesTab {
  readonly fileDetails: FileDetailsViewer;

  constructor(
    private page: Page,
    private expect: Expect,
  ) {
    this.fileDetails = new FileDetailsViewer(page, expect);
  }

  // ---------------------------------------------------------------------------
  // Locators — define each UI concept once
  // ---------------------------------------------------------------------------

  private get tabButton() {
    return this.page.locator("nav button", { hasText: "Changes" }).first();
  }

  private get badge() {
    return this.tabButton.locator("span.rounded-full:not(.animate-spin)");
  }

  private get spinner() {
    return this.tabButton.locator("span.animate-spin");
  }

  private get htmlSectionFilterBtn() {
    return this.page.locator('button[title="Filter changes"]');
  }

  private get htmlSectionChangesHeading() {
    return this.page.getByText("HTML Section", { exact: true });
  }

  private get modifiedFileIndicators() {
    return this.page.locator('span[title="Modified"]');
  }

  private get newFileIndicators() {
    return this.page.locator('span[title="New file"]');
  }

  private get deletedFileIndicators() {
    return this.page.locator('span[title="Deleted"]');
  }

  /** Get the count element for a given HTML section label in the filter dropdown. */
  private sectionFilterCount(sectionLabel: string) {
    return this.page.locator("label").filter({ hasText: sectionLabel }).locator("span.tabular-nums");
  }

  /** Get the count element for a change type label (Added/Modified/Deleted) in the filter dropdown. */
  private changeTypeFilterCount(label: string) {
    return this.page.locator("label").filter({ hasText: label }).locator("span.tabular-nums");
  }

  /** Get the checkbox for a change type label (Added/Modified/Deleted) in the filter dropdown. */
  private changeTypeCheckbox(label: string) {
    return this.page.locator("label").filter({ hasText: label }).locator('input[type="checkbox"]');
  }

  private get noVisibleHtmlSections() {
    return this.page.getByText("No visible HTML section changes");
  }

  private get hiddenByFilter() {
    return this.page.locator("text=/\\d+ hidden by filter/");
  }

  // ---------------------------------------------------------------------------
  // Badge and regeneration
  // ---------------------------------------------------------------------------

  /** Assert the Changes tab badge is visible (has a positive count). */
  async expectBadgeVisible() {
    await this.expect(this.badge).toBeVisible({ timeout: 15_000 });
  }

  /** Assert the Changes tab badge is not visible (no changes). */
  async expectNoBadge() {
    await this.expect(this.badge).not.toBeVisible({ timeout: 15_000 });
  }

  /** Wait for preview regeneration to complete (spinner appears then disappears). */
  async waitForRegenerationComplete() {
    // Race: either see the spinner appear, or see the badge appear (regeneration
    // already finished).  This avoids a fixed timeout when regeneration is fast.
    const sawSpinner = this.expect(this.spinner).toBeVisible({ timeout: 60_000 })
      .then(() => 'spinner' as const);
    const sawBadge = this.expect(this.badge).toBeVisible({ timeout: 60_000 })
      .then(() => 'badge' as const);
    await Promise.race([sawSpinner, sawBadge]);
    // Ensure spinner is gone before continuing
    await this.expect(this.spinner).not.toBeVisible({ timeout: 60_000 });
  }

  // ---------------------------------------------------------------------------
  // File status assertions
  // ---------------------------------------------------------------------------

  /** Assert only modified files (M) are shown — no new (A) or deleted (D). */
  async expectOnlyModifiedFiles() {
    await this.expect(this.modifiedFileIndicators.first()).toBeVisible({ timeout: 15_000 });
    await this.expect(this.newFileIndicators).toHaveCount(0);
    await this.expect(this.deletedFileIndicators).toHaveCount(0);
  }

  /** Assert only new files (A) are shown — no modified (M) or deleted (D). */
  async expectOnlyNewFiles() {
    await this.expect(this.newFileIndicators.first()).toBeVisible({ timeout: 15_000 });
    await this.expect(this.modifiedFileIndicators).toHaveCount(0);
    await this.expect(this.deletedFileIndicators).toHaveCount(0);
  }

  /** Assert the "No changed files" message is visible. */
  async expectNoChangedFiles() {
    await this.expect(this.page.getByText("No changed files")).toBeVisible({ timeout: 15_000 });
  }

  /** Click the first `.html` file in the changed files tree. */
  async clickFirstHtmlFile() {
    const htmlFile = this.page.locator('span:text-matches("\\.html$")').first();
    await this.expect(htmlFile).toBeVisible({ timeout: 15_000 });
    await htmlFile.click();
  }

  /** Assert that no file matching the given name appears in the changes list. */
  async expectFileNotInChanges(filename: string) {
    const match = this.page.locator(`span:has-text("${filename}")`);
    await this.expect(match).toHaveCount(0);
  }

  // ---------------------------------------------------------------------------
  // HTML section changes filter
  // ---------------------------------------------------------------------------

  /** Open the HTML section changes filter dropdown. */
  async openHtmlSectionChangesFilter() {
    await this.expect(this.htmlSectionFilterBtn).toBeVisible();
    await this.htmlSectionFilterBtn.click();
    await this.expect(this.htmlSectionChangesHeading).toBeVisible();
  }

  /** Assert that only the given sections are visible in the filter dropdown (zero-count sections are hidden). */
  async expectOnlySectionsWithChanges(sections: string[]) {
    // Sections with zero changes are hidden from the dropdown entirely.
    // Verify expected sections are visible with non-zero counts.
    for (const section of sections) {
      const countEl = this.sectionFilterCount(section);
      await this.expect(countEl).toBeVisible();
      const text = await countEl.textContent();
      const num = Number(text);
      if (num <= 0) throw new Error(`Expected ${section} to have changes but count was ${num}`);
    }
    // Verify sections NOT in the list are not visible.
    for (const section of ["<head>", "<header>", "<main>", "<footer>"]) {
      if (!sections.includes(section)) {
        const countEl = this.sectionFilterCount(section);
        await this.expect(countEl).not.toBeVisible();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Change type filter
  // ---------------------------------------------------------------------------

  /** Assert the count for a change type in the filter dropdown. */
  async expectChangeTypeCount(label: string, expected: number) {
    const countEl = this.changeTypeFilterCount(label);
    await this.expect(countEl).toBeVisible();
    const text = await countEl.textContent();
    const num = Number(text);
    if (num !== expected) throw new Error(`Expected ${label} count ${expected} but got ${num}`);
  }

  /** Uncheck a change type filter checkbox (Added/Modified/Deleted). */
  async uncheckChangeType(label: string) {
    const checkbox = this.changeTypeCheckbox(label);
    await this.expect(checkbox).toBeVisible();
    await checkbox.uncheck();
  }

  /** Assert the "No visible HTML section changes" message is shown. */
  async expectNoVisibleHtmlSections() {
    await this.expect(this.noVisibleHtmlSections).toBeVisible();
  }

  /** Assert the hidden-by-filter count. */
  async expectHiddenCount(expected: number) {
    await this.expect(this.page.getByText(`${expected} hidden by filter`)).toBeVisible();
  }

  /** Assert a specific HTML section has the given count in the filter dropdown. */
  async expectSectionCount(sectionLabel: string, expected: number) {
    const countEl = this.sectionFilterCount(sectionLabel);
    await this.expect(countEl).toBeVisible();
    const text = await countEl.textContent();
    const num = Number(text);
    if (num !== expected) throw new Error(`Expected ${sectionLabel} count ${expected} but got ${num}`);
  }

  /** Uncheck an HTML section filter checkbox. */
  async uncheckHtmlSection(sectionLabel: string) {
    const checkbox = this.page.locator("label").filter({ hasText: sectionLabel }).locator('input[type="checkbox"]');
    await this.expect(checkbox).toBeVisible();
    await checkbox.uncheck();
  }
}
