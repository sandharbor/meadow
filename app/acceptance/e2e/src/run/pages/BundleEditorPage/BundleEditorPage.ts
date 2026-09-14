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

import type { Page, Expect, Response } from "@playwright/test";
import { SourceSnapshotsModal } from "./components/SourceSnapshotsModal.js";
import { SourceReviewModal } from "./components/SourceReviewModal.js";

function isCommittedCurationResponse(response: Response): boolean {
  const url = response.url();
  return response.request().method() === "POST" && (
    url.includes("/curation/track-nodes")
    || url.includes("/curation/node/")
    || url.includes("/curation/bundle-config")
  );
}

function isWorkingGraphResponse(response: Response): boolean {
  return response.request().method() === "GET"
    && response.url().includes("/curation/working-graph");
}

function isBundleConfigResponse(response: Response): boolean {
  return response.request().method() === "GET"
    && new URL(response.url()).pathname.endsWith("/curation/bundle-config");
}

export class BundleEditorPage {
  readonly sourceReview: SourceReviewModal;

  constructor(
    private page: Page,
    private expect: Expect,
  ) {
    this.sourceReview = new SourceReviewModal(page, expect);
  }

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
    const escapedBundleName = bundleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await this.page.waitForURL(new RegExp(`/bundle/${escapedBundleName}(?:[?#].*)?$`));
    await this.expect(this.graphViewBtn).toBeVisible();
  }

  async expectSourceUpdateInToolbar() {
    const status = this.page.getByTestId('sourcing-status');
    await this.expect(status.getByRole('status')).toHaveText('Refreshing sources');
    await this.expect(status.locator('.animate-spin')).toBeVisible();
    const statusBox = await status.boundingBox();
    const menuBox = await this.page.getByTitle('Bundle options', { exact: true }).boundingBox();
    this.expect(statusBox).not.toBeNull();
    this.expect(menuBox).not.toBeNull();
    this.expect(statusBox!.x + statusBox!.width).toBeLessThanOrEqual(menuBox!.x);
    this.expect(Math.abs(statusBox!.y + statusBox!.height / 2 - menuBox!.y - menuBox!.height / 2)).toBeLessThan(2);
    await this.expect(this.page.getByText('Curation', { exact: true })).not.toBeVisible();
    await this.expect(this.page.getByText('Sourcing', { exact: true })).not.toBeVisible();
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

  async expectGraphNodePresent(bundleNodeKey: string) {
    await this.expect(
      this.page.locator(`[data-testid="graph-page-node"][data-page-id="${bundleNodeKey}"]`),
    ).toBeVisible();
  }

  async expectGraphNodeNotPresent(bundleNodeKey: string) {
    await this.expect(
      this.page.locator(`[data-testid="graph-page-node"][data-page-id="${bundleNodeKey}"]`),
    ).toHaveCount(0);
  }

  async expectGraphEdgeKindControlsVisible() {
    await this.expect(this.page.getByRole("button", { name: "Links", exact: true })).toBeVisible();
    await this.expect(this.page.getByRole("button", { name: "Structure", exact: true })).toBeVisible();
  }

  async expectGraphEdgeKindControlsHidden() {
    await this.expect(this.page.getByRole("button", { name: "Links", exact: true })).toHaveCount(0);
    await this.expect(this.page.getByRole("button", { name: "Structure", exact: true })).toHaveCount(0);
  }

  async expectGraphTextIsNotSelectable() {
    const graphCanvas = this.page.getByTestId("graph-canvas");
    await this.expect(graphCanvas).toBeVisible();
    await this.expect.poll(() => graphCanvas.evaluate(element => (
      window.getComputedStyle(element).userSelect
    ))).toBe("none");
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

  async expectDepthCalloutNotVisible() {
    await this.expect(this.depthCallout).not.toBeVisible();
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

  private listViewRowByNodeKey(bundleNodeKey: string) {
    return this.page.locator(
      `table tbody tr[data-bundle-node-key=${JSON.stringify(bundleNodeKey)}]`,
    );
  }

  async clickListViewRowByNodeKey(bundleNodeKey: string) {
    const row = this.listViewRowByNodeKey(bundleNodeKey);
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

  async expectStructuralListHasNoTrackingLabels() {
    await this.expect(
      this.page.locator('tr[data-structure-section]').getByText(/^(Tracked|Not Tracked)$/),
    ).toHaveCount(0);
  }

  async expectFolderScopeChangesBannerNotVisible() {
    await this.expect(this.page.getByText(/Folder scope changes:/)).toHaveCount(0);
  }

  async clickListSort(column: "Title" | "Directory" | "Type" | "Distance") {
    await this.page.getByRole("columnheader", { name: new RegExp(`^${column}`) }).click();
  }

  async expectStructuralSectionOrder(section: "selected-folders" | "outside", titles: string[]) {
    const rows = this.page.locator(`tr[data-structure-section="${section}"]`);
    await this.expect.poll(() => rows.evaluateAll(elements => (
      elements.map(element => element.getAttribute("data-bundle-node-name"))
    ))).toEqual(titles);
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
      .locator('[data-thumbnail-state="loaded"], [role="img"] svg')
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

  async expectImageHoverPreviewVisible(title: string) {
    const preview = this.page.getByTestId("image-hover-preview");
    await this.expect(preview).toBeVisible();
    await this.expect(preview).toContainText(title);
  }

  async clickTrackAll() {
    const btn = this.page.locator("button", { hasText: "Track All" });
    await this.expect(btn).toBeVisible();
    // Tracking is a "simple op" that auto-saves + commits in the backend.
    // Wait for the shared Runtime curation command so the test can proceed
    // deterministically without a fixed sleep.
    await Promise.all([
      this.page.waitForResponse(
        isCommittedCurationResponse,
        { timeout: 15000 },
      ),
      this.page.waitForResponse(isBundleConfigResponse, { timeout: 15000 }),
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
  // Source updates and orphan review
  // ---------------------------------------------------------------------------

  async waitForSourceCheck() {
    await this.expect(this.page.getByTestId('sourcing-status').getByRole('button', { name: /^(Refresh sources|\d+ source changes? available.*Review)$/ })).toBeVisible();
  }

  async checkSourceChanges() {
    await this.waitForSourceCheck();
    const update = this.page.getByRole('button', { name: 'Refresh sources', exact: true });
    if (await update.isVisible()) {
      await update.click();
      await this.waitForSourceCheck();
      return;
    }
    await this.sourceReview.open();
    await this.sourceReview.checkAgain();
    await this.sourceReview.defer();
    await this.waitForSourceCheck();
  }

  async expectSourceOrphanCount(count: number) {
    await this.waitForSourceCheck();
    await this.expect(this.page.getByTestId('sourcing-status')).toHaveAttribute('data-orphan-count', String(count));
    await this.expect(this.page.getByTestId('orphans-banner')).not.toBeVisible();
  }

  async reviewSourceHistory() {
    await this.page.getByTitle('Bundle options', { exact: true }).click();
    await this.page.getByRole('button', { name: 'Source snapshots', exact: true }).click();
    const snapshots = new SourceSnapshotsModal(this.page, this.expect);
    await snapshots.expectOpen();
    return snapshots;
  }

  async reviewSourceOrphans() {
    return this.sourceReview.reviewOrphans();
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

  async rightClickListViewRowByExactName(text: string) {
    const row = this.listViewRows.filter({
      has: this.page.locator(`td >> text="${text}"`),
    }).first();
    await this.expect(row).toBeVisible();
    await row.click({ button: "right" });
    await this.page.waitForTimeout(250);
  }

  async rightClickListViewRowByNodeKey(bundleNodeKey: string) {
    const row = this.listViewRowByNodeKey(bundleNodeKey);
    await this.expect(row).toBeVisible();
    await row.click({ button: "right" });
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
    return this.page.locator(".fixed.w-48").getByRole("button", {
      name: text,
      exact: true,
    });
  }

  async clickContextMenuItem(text: string) {
    const item = this.contextMenuItem(text);
    await this.expect(item).toBeVisible();
    await this.expect(item).toBeEnabled();
    await item.click();
  }

  async expectSelectedPageBadge(bundleNodeKey: string, badge: string) {
    const selectedPage = this.page.getByTestId(`selected-page-${bundleNodeKey}`);
    await this.expect(selectedPage).toBeVisible();
    await this.expect(selectedPage.getByText(badge, { exact: true })).toBeVisible();
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
   * committed Runtime curation POST to complete. Use this for simple ops
   * that auto-save in the backend so tests don't rely on fixed sleeps.
   */
  async clickContextMenuItemAndAwaitAutoSave(text: string) {
    const item = this.contextMenuItem(text);
    await this.expect(item).toBeVisible();
    await this.expect(item).toBeEnabled();
    await Promise.all([
      this.page.waitForResponse(
        isCommittedCurationResponse,
        { timeout: 15000 },
      ),
      this.page.waitForResponse(isBundleConfigResponse, { timeout: 15000 }),
      item.click(),
    ]);
  }

  async clickContextMenuItemAndAwaitAutoSaveAndGraphReload(text: string) {
    const item = this.contextMenuItem(text);
    await this.expect(item).toBeVisible();
    await this.expect(item).toBeEnabled();
    await Promise.all([
      this.page.waitForResponse(
        isCommittedCurationResponse,
        { timeout: 15000 },
      ),
      this.page.waitForResponse(isWorkingGraphResponse, { timeout: 15000 }),
      this.page.waitForResponse(isBundleConfigResponse, { timeout: 15000 }),
      item.click(),
    ]);
  }
}
