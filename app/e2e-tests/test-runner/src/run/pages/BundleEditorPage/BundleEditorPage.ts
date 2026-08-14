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

export class BundleEditorPage {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  // ---------------------------------------------------------------------------
  // Shared locators
  // ---------------------------------------------------------------------------

  private get graphViewBtn() {
    return this.page.locator("button", { hasText: "Graph View" });
  }

  private get depthCallout() {
    return this.page.getByText("We started small!");
  }

  private get emptySoloCallout() {
    return this.page.getByTestId("empty-solo-callout");
  }

  private get listViewRows() {
    return this.page.locator("table tbody tr");
  }

  async waitForLoad(bundleName: string) {
    await this.page.waitForURL(new RegExp(`/bundle/${bundleName}`));
    await this.expect(this.graphViewBtn).toBeVisible();
  }

  async clickPreview() {
    const previewButton = this.page.locator("button", { hasText: "Preview" });
    await this.expect(previewButton).toBeVisible();
    await previewButton.click();
  }

  async clickSelectAll() {
    const btn = this.page.locator("button", { hasText: "Select All" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async getSelectedPageTitles(): Promise<string[]> {
    const items = this.page.locator(
      ".divide-y.divide-neutral-200 > .p-4 .text-sm.font-medium.truncate",
    );
    return items.allTextContents();
  }

  async clickMoreOptionsDropdown() {
    const btn = this.page.locator('button[title="More options"]');
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async switchToListView() {
    const btn = this.page.locator("button", { hasText: "List View" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async switchToStructuralListView() {
    const btn = this.page.getByRole("button", { name: "Structure", exact: true });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async switchToGraphView() {
    await this.expect(this.graphViewBtn).toBeVisible();
    await this.graphViewBtn.click();
  }

  async getListViewPageCount(): Promise<number> {
    return this.listViewRows.count();
  }

  async getListViewNodeTypes(): Promise<string[]> {
    return this.listViewRows.locator("td:nth-child(4)").allTextContents();
  }

  async expectGraphViewPageCount(count: number) {
    await this.expect(this.page.getByTestId("graph-page-node")).toHaveCount(count);
  }

  async expectGraphViewHasPages() {
    await this.expect(this.page.getByTestId("graph-page-node").first()).toBeVisible();
  }

  async expectGraphEdgeKindControlsVisible() {
    await this.expect(this.page.getByRole("button", { name: "Links", exact: true })).toBeVisible();
    await this.expect(this.page.getByRole("button", { name: "Structure", exact: true })).toBeVisible();
  }

  async expectGraphEdgeKindControlsHidden() {
    await this.expect(this.page.getByRole("button", { name: "Links", exact: true })).toHaveCount(0);
    await this.expect(this.page.getByRole("button", { name: "Structure", exact: true })).toHaveCount(0);
  }

  async clickBackToBundles() {
    const btn = this.page.locator("button", { hasText: "← Bundles" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async clickBundleOptionsMenu() {
    const btn = this.page.locator('button[title="Bundle options"]');
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async clickDeleteBundleOption() {
    const btn = this.page.locator("button", { hasText: "Delete bundle" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async expectDepthCalloutVisible() {
    await this.expect(this.depthCallout).toBeVisible();
  }

  async expectDepthCalloutNotVisible() {
    await this.expect(this.depthCallout).not.toBeVisible();
  }

  async dismissDepthCallout() {
    const dismissBtn = this.page.locator('button[title="Dismiss"]');
    await this.expect(dismissBtn).toBeVisible();
    await dismissBtn.click();
  }

  async expectSinglePagePreviewWarningVisible() {
    await this.expect(
      this.page.getByText("Only one page is tracked"),
    ).toBeVisible();
  }

  async clickGoBackAndTrackMorePages() {
    const btn = this.page.locator("button", { hasText: "Track more" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  async expectGraphViewButtonVisible() {
    await this.expect(this.graphViewBtn).toBeVisible();
  }

  async expectGraphViewActive() {
    await this.expect(this.graphViewBtn).toHaveClass(/border-main-500/);
  }

  getSelectedPageRoot() {
    return this.page.locator('[data-testid^="selected-page-"]').first();
  }

  async clickListViewRow(rowIndex: number) {
    const row = this.listViewRows.nth(rowIndex);
    await this.expect(row).toBeVisible();
    await row.click();
  }

  async clickListViewRowByName(text: string) {
    const row = this.listViewRows.filter({ hasText: text });
    await this.expect(row).toBeVisible();
    await row.click();
  }

  /** Click the list-view row whose first cell exactly matches the given title. */
  async clickListViewRowByExactName(text: string) {
    const row = this.listViewRows.filter({
      has: this.page.locator(`td >> text="${text}"`),
    }).first();
    await this.expect(row).toBeVisible();
    await row.click();
  }

  /** Assert that no list-view row with the given exact title exists. */
  async expectListViewRowByExactNameNotPresent(text: string) {
    const row = this.listViewRows.filter({
      has: this.page.locator(`td >> text="${text}"`),
    }).first();
    await this.expect(row).not.toBeVisible();
  }

  /** Assert that a list-view row with the given exact title exists. */
  async expectListViewRowByExactNamePresent(text: string) {
    const row = this.listViewRows.filter({
      has: this.page.locator(`td >> text="${text}"`),
    }).first();
    await this.expect(row).toBeVisible();
  }

  async expectStructuralListHasNoSelectionColumn() {
    await this.expect(this.page.locator("table thead th")).toHaveCount(4);
  }

  async expectListViewNodeGlyph(title: string, nodeKind: "file" | "folder" | "collection") {
    const row = this.listViewRows.filter({
      has: this.page.locator(`td >> text="${title}"`),
    }).first();
    await this.expect(row.getByTestId("list-node-glyph")).toHaveAttribute("data-node-kind", nodeKind);
  }

  /**
   * Assert a list-view row exists with the given exact title cell AND the
   * given file-type cell (e.g. `.png`, `.svg`, `.excalidraw`). Handy when
   * the same title appears for multiple file types (an image and its
   * Excalidraw drawing, for instance).
   */
  async expectListViewRowByTitleAndFileTypePresent(title: string, fileType: string) {
    const row = this.listViewRowByTitleAndFileType(title, fileType);
    await this.expect(row).toBeVisible();
  }

  private listViewRowByTitleAndFileType(title: string, fileType: string) {
    return this.listViewRows
      .filter({ has: this.page.locator(`td >> text="${title}"`) })
      .filter({ has: this.page.locator(`td:text-is(".${fileType}")`) })
      .first();
  }

  private listViewThumbnail(title: string, fileType: string) {
    return this.listViewRowByTitleAndFileType(title, fileType)
      .locator('[role="img"] svg')
      .first();
  }

  async expectListViewThumbnailVisible(title: string, fileType: string) {
    const row = this.listViewRowByTitleAndFileType(title, fileType);
    await row.scrollIntoViewIfNeeded();
    await this.expect(this.listViewThumbnail(title, fileType)).toBeVisible({
      timeout: 30_000,
    });
  }

  async hoverListViewThumbnail(title: string, fileType: string) {
    await this.listViewThumbnail(title, fileType).hover();
  }

  async clickTrackAll() {
    const btn = this.page.locator("button", { hasText: "Track All" });
    await this.expect(btn).toBeVisible();
    // Tracking is a "simple op" that auto-saves + commits in the backend.
    // Wait for the copy-tracked-pages response so the test can proceed
    // deterministically without a fixed sleep.
    await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes("/copy-tracked-pages") &&
          r.request().method() === "POST",
        { timeout: 15000 },
      ),
      btn.click(),
    ]);
  }

  /** Click "Deselect sensitive pages" if the button is visible. */
  async clickDeselectSensitivePagesIfVisible() {
    const btn = this.page.locator("button", {
      hasText: "Deselect sensitive pages",
    });
    if (await btn.isVisible()) {
      await btn.click();
    }
  }

  /** Click the "Save" button (e.g. after tracking/config changes). */
  async clickSave() {
    const btn = this.page.locator("button", { hasText: "Save" }).first();
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  /** Click the "Undo" button to revert unsaved config changes. */
  async clickUndo() {
    const btn = this.page.locator("button", { hasText: "Undo" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  /** Assert the "Undo" button is visible (draft changes exist). */
  async expectUndoVisible() {
    const btn = this.page.locator("button", { hasText: "Undo" });
    await this.expect(btn).toBeVisible();
  }

  /** Assert the "Undo" button is not visible (no draft changes). */
  async expectUndoNotVisible() {
    const btn = this.page.locator("button", { hasText: "Undo" });
    await this.expect(btn).not.toBeVisible();
  }

  async expectEmptySoloCalloutVisible() {
    await this.expect(this.emptySoloCallout).toBeVisible();
  }

  async expectEmptySoloCalloutNotVisible() {
    await this.expect(this.emptySoloCallout).not.toBeVisible();
  }

  async clickTurnOffSolos() {
    const btn = this.page.locator("button", { hasText: "Turn off solos" });
    await this.expect(btn).toBeVisible();
    await btn.click();
  }

  // ---------------------------------------------------------------------------
  // Orphaned pages callout
  // ---------------------------------------------------------------------------

  private get orphansBanner() {
    return this.page.getByTestId("orphans-banner");
  }

  private get orphansBannerCount() {
    return this.page.getByTestId("orphans-banner-count");
  }

  private get reviewOrphanedPagesBtn() {
    return this.page.getByTestId("review-orphans-button");
  }

  async expectOrphansBannerCount(count: number) {
    await this.expect(this.orphansBanner).toBeVisible();
    await this.expect(this.orphansBannerCount).toContainText(String(count));
  }

  async clickReviewOrphanedPages() {
    await this.expect(this.reviewOrphanedPagesBtn).toBeVisible();
    await this.reviewOrphanedPagesBtn.click();
  }

  async expectOrphansBannerNotVisible() {
    await this.expect(this.orphansBanner).not.toBeVisible();
  }

  // ---------------------------------------------------------------------------
  // Labels
  // ---------------------------------------------------------------------------

  private get labelGroup() {
    return this.page.locator("g.search-labels");
  }

  async expectLabelVisible(text: string) {
    await this.expect(
      this.labelGroup.locator("text", { hasText: text }),
    ).toBeVisible();
  }

  // ---------------------------------------------------------------------------
  // Context menu — sensitivity
  // ---------------------------------------------------------------------------

  private listViewRow(text: string) {
    return this.listViewRows.filter({ hasText: text });
  }

  private get markSensitiveBtn() {
    return this.page.locator("button", { hasText: "Mark Sensitive" });
  }

  private get markNotSensitiveBtn() {
    return this.page.locator("button", { hasText: "Mark Not Sensitive" });
  }

  private get consentModalHeading() {
    return this.page.getByText("Heads Up");
  }

  private get consentProceedBtn() {
    return this.page.locator("button", {
      hasText: "I Understand, Proceed",
    });
  }

  async rightClickRow(rowText: string) {
    await this.listViewRow(rowText).click({ button: "right" });
    await this.page.waitForTimeout(250);
  }

  /** Right-click a list-view row by its zero-based index to open the context menu. */
  async rightClickListViewRow(rowIndex: number) {
    const row = this.listViewRows.nth(rowIndex);
    await this.expect(row).toBeVisible();
    await row.click({ button: "right" });
    await this.page.waitForTimeout(250);
  }

  private get findInBundlesBtn() {
    return this.page.locator("button", { hasText: "Find in Bundles" });
  }

  /** The Solo button in the Selection toolbar (inside <nav>). */
  private get selectionSoloBtn() {
    return this.page.locator('nav button[title="Solo"]');
  }

  async clickFindInBundles() {
    await this.expect(this.findInBundlesBtn).toBeVisible();
    await this.findInBundlesBtn.click();
  }

  async clickSoloSelection() {
    await this.expect(this.selectionSoloBtn).toBeVisible();
    await this.selectionSoloBtn.click();
  }

  async clickMarkSensitive() {
    await this.expect(this.markSensitiveBtn).toBeVisible();
    await this.markSensitiveBtn.click();
  }

  async clickMarkNotSensitive() {
    await this.expect(this.markNotSensitiveBtn).toBeVisible();
    await this.markNotSensitiveBtn.click();
  }

  async expectConsentModalVisible() {
    await this.expect(this.consentModalHeading).toBeVisible();
  }

  async expectConsentModalNotVisible() {
    await this.expect(this.consentModalHeading).not.toBeVisible();
  }

  async clickConsentProceed() {
    await this.expect(this.consentProceedBtn).toBeVisible();
    await this.consentProceedBtn.click();
  }

  // ---------------------------------------------------------------------------
  // Context menu — item assertions
  // ---------------------------------------------------------------------------

  private contextMenuItem(text: string) {
    return this.page.locator(".fixed.w-48 button", { hasText: text });
  }

  async expectContextMenuItemVisible(text: string) {
    await this.expect(this.contextMenuItem(text)).toBeVisible();
  }

  async expectContextMenuItemNotVisible(text: string) {
    await this.expect(this.contextMenuItem(text)).not.toBeVisible();
  }

  async expectContextMenuItemDisabled(text: string) {
    const item = this.contextMenuItem(text);
    await this.expect(item).toBeVisible();
    await this.expect(item).toBeDisabled();
  }

  async expectContextMenuItemEnabled(text: string) {
    const item = this.contextMenuItem(text);
    await this.expect(item).toBeVisible();
    await this.expect(item).toBeEnabled();
  }

  /**
   * Click a context menu item (e.g. "Blacklist", "Untrack") and wait for the
   * auto-save `copy-tracked-pages` POST to complete. Use this for simple ops
   * that auto-save in the backend so tests don't rely on fixed sleeps.
   */
  async clickContextMenuItemAndAwaitAutoSave(text: string) {
    const item = this.contextMenuItem(text);
    await this.expect(item).toBeVisible();
    await this.expect(item).toBeEnabled();
    await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes("/copy-tracked-pages") &&
          r.request().method() === "POST",
        { timeout: 15000 },
      ),
      item.click(),
    ]);
  }
}
