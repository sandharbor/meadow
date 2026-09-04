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
import { GeneratedBundle } from "../../../shared/GeneratedBundle.js";

export class PreviewPublishModal {
  readonly generatedBundle: GeneratedBundle;

  constructor(
    private page: Page,
    private expect: Expect,
  ) {
    this.generatedBundle = GeneratedBundle.inPreview(page, expect);
  }

  // ---------------------------------------------------------------------------
  // Locators — define each UI concept once
  // ---------------------------------------------------------------------------

  private get bundlePreviewTab() {
    return this.page.locator("button", { hasText: "Bundle Preview" });
  }

  private get shareTab() {
    return this.page.getByRole("button", { name: /^2\s*Share$/ });
  }

  private get customizeSidebarLabel() {
    return this.page.locator("button", { hasText: "Customize" });
  }

  private get collapseSidebarBtn() {
    return this.page.locator('button[title="Collapse sidebar"]');
  }

  private get saveChangesBtn() {
    return this.page.locator("button", { hasText: "Save Changes" });
  }

  private get createNewVersionBtn() {
    return this.page.getByRole("button", { name: "Create New Version", exact: true });
  }

  private get closeBtn() {
    return this.page.locator(".absolute.top-3.right-4 button");
  }

  private get previewIframe() {
    return this.page.frameLocator('iframe[title="Preview"]');
  }

  private get previewIframeH1() {
    return this.previewIframe.locator("main h1").first();
  }

  private get changesTab() {
    return this.page.locator("nav button", { hasText: "Changes" }).first();
  }

  private get versionsTab() {
    return this.page.locator("nav button", { hasText: "Versions" }).first();
  }

  private get step1ReviewBtn() {
    return this.page.locator("button", { hasText: /^\d+\s*Review$/ });
  }

  private get checkUntrackedPagesBtn() {
    return this.page.locator("button", { hasText: /Check (them|it)/ });
  }

  private get shareVersionSelector() {
    return this.page.locator("#share-version-selector");
  }

  private get createVersionDialog() {
    return this.page.getByRole("heading", { name: "Create New Version", exact: true })
      .locator('xpath=ancestor::div[contains(@class,"fixed") and contains(@class,"inset-0")][1]');
  }

  private get okfRenameModalHeading() {
    return this.page.getByRole("heading", { name: "OKF Reserved Files Renamed" });
  }

  private get okfRenameModalCloseBtn() {
    return this.page
      .locator("div.fixed.inset-0.bg-black")
      .filter({ has: this.okfRenameModalHeading })
      .locator("button", { hasText: "×" })
      .last();
  }

  // ---------------------------------------------------------------------------
  // Preview completion
  // ---------------------------------------------------------------------------

  async waitForPreviewComplete() {
    await this.expect(this.page.getByText(/untracked page/)).toBeVisible({
      timeout: 60_000,
    });
    // The warning appears before the atomic staging directory has necessarily
    // been promoted. Wait for the editor's generation action to leave its
    // Loading state so teardown cannot race a staging-directory rename.
    await this.expect(
      this.page.getByRole("button", { name: "Preview", exact: true }).first(),
    ).toBeEnabled({ timeout: 60_000 });
  }

  /** Wait for preview to finish when the bundle has no untracked pages. */
  async waitForPreviewCompleteAllTracked() {
    await this.expect(this.bundlePreviewTab).toBeVisible({ timeout: 60_000 });
    await this.expect(
      this.page.getByRole("button", { name: "Preview", exact: true }).first(),
    ).toBeEnabled({ timeout: 60_000 });
  }

  // ---------------------------------------------------------------------------
  // Tab navigation
  // ---------------------------------------------------------------------------

  async clickShareTab() {
    await this.expect(this.shareTab).toBeEnabled({ timeout: 60_000 });
    await this.shareTab.click();
  }

  async expectShareVersionSelected(versionId: string, casualName?: string) {
    await this.expect(this.shareVersionSelector).toHaveValue(versionId);
    await this.expect(this.shareVersionSelector.locator("option:checked")).toContainText("current");
    if (casualName) {
      await this.expect(this.shareVersionSelector.locator("option:checked")).toContainText(casualName);
      await this.expect(this.shareVersionSelector.locator("option:checked")).toContainText(/\b20\d{2}\b/);
    }
  }

  async expectShareVersionOptionsNewestFirst(newestVersionId: string, oldestVersionId: string) {
    const options = this.shareVersionSelector.locator("option");
    await this.expect(options).toHaveCount(2);
    await this.expect(options.nth(0)).toHaveAttribute("value", newestVersionId);
    await this.expect(options.nth(0)).toContainText("v2");
    await this.expect(options.nth(0)).toContainText("current");
    await this.expect(options.nth(1)).toHaveAttribute("value", oldestVersionId);
    await this.expect(options.nth(1)).toContainText("v1");
  }

  async expectShareVersionSelectorHidden() {
    await this.expect(this.shareVersionSelector).toHaveCount(0);
  }

  async selectShareVersion(versionId: string) {
    await this.shareVersionSelector.selectOption(versionId);
    await this.expect(this.shareVersionSelector).toHaveValue(versionId);
  }

  async expectShareVersionPurpose(action: "publish" | "export") {
    await this.expect(this.page.getByLabel(`Version to ${action}`)).toBeVisible();
  }

  async expectOlderShareVersionWarning(selectedCasualName: string, currentCasualName: string) {
    await this.expect(this.page.getByRole("status")).toHaveText(
      new RegExp(`will use ${selectedCasualName}, an older generated version\\. The current generated version is ${currentCasualName}\\.`),
    );
  }

  async clickBundlePreviewTab() {
    await this.expect(this.bundlePreviewTab).toBeVisible();
    await this.bundlePreviewTab.click();
  }

  async expectSingleVersionExplanation() {
    await this.expect(this.page.getByRole("heading", { name: "Why create a new version?" })).toBeVisible();
    await this.expect(this.page.getByText(/big changes/)).toBeVisible();
    await this.expect(this.page.getByText(/freezes the existing generated files and creates a new current version/)).toBeVisible();
    await this.expect(this.page.getByText(/Publishing destinations decide separately/)).toBeVisible();
  }

  async expectVersionCardsNewestFirst(newestVersionId: string, oldestVersionId: string) {
    const cards = this.page.locator('[data-testid="version-card"]');
    await this.expect(cards).toHaveCount(2);
    await this.expect(cards.nth(0)).toHaveAttribute("data-version-id", newestVersionId);
    await this.expect(cards.nth(0)).toHaveAttribute("data-version-name", "v2");
    await this.expect(cards.nth(0)).toHaveAttribute("data-version-age", "latest");
    await this.expect(cards.nth(1)).toHaveAttribute("data-version-id", oldestVersionId);
    await this.expect(cards.nth(1)).toHaveAttribute("data-version-name", "v1");
    await this.expect(cards.nth(1)).toHaveAttribute("data-version-age", "older");
  }

  async openCustomizeSidebar() {
    // The sidebar may already be open (auto-opens on first preview if not
    // previously dismissed).  When open, "Customize" is a heading span, not
    // a button — so the button locator won't match.  Detect via the
    // "Collapse sidebar" button instead.
    const alreadyOpen = await this.collapseSidebarBtn.isVisible();
    if (alreadyOpen) return;
    await this.expect(this.customizeSidebarLabel).toBeVisible();
    await this.customizeSidebarLabel.click();
  }

  async closeCustomizeSidebar() {
    if (await this.collapseSidebarBtn.isVisible()) {
      await this.collapseSidebarBtn.click();
    }
  }

  // ---------------------------------------------------------------------------
  // Preview iframe
  // ---------------------------------------------------------------------------

  /** Get the h1 heading text from the preview iframe. */
  async getPreviewIframeHeading(): Promise<string> {
    await this.expect(this.previewIframeH1).toBeVisible({ timeout: 30_000 });
    return (await this.previewIframeH1.textContent()) || "";
  }

  /** Assert the preview iframe h1 contains the expected text, with auto-retry. */
  async expectPreviewIframeHeading(expectedText: string, timeout = 60_000) {
    await this.expect(this.previewIframeH1).toContainText(expectedText, { timeout });
  }

  async expectPreviewIframeUrlContains(expectedPath: string, timeout = 15_000) {
    await this.expect.poll(
      async () => {
        const iframeHandle = await this.page.locator('iframe[title="Preview"]').elementHandle();
        if (!iframeHandle) return "";

        try {
          const frame = await iframeHandle.contentFrame();
          return frame?.url() ?? "";
        } finally {
          await iframeHandle.dispose();
        }
      },
      { timeout },
    ).toContain(expectedPath);
  }

  /**
   * Assert the preview iframe contains a link pointing at the given rendered
   * page href (e.g. "Razors.html"). Use this to verify that a tracked page
   * is linked from the currently previewed page.
   */
  async expectPreviewLinkVisible(href: string) {
    await this.expect(this.previewIframe.locator(`a[href="${href}"]`)).toBeVisible();
  }

  /**
   * Assert the preview iframe does NOT contain a link pointing at the given
   * rendered page href. Use this to verify that a blacklisted page has been
   * removed from the generated bundle.
   */
  async expectPreviewLinkNotVisible(href: string) {
    await this.expect(this.previewIframe.locator(`a[href="${href}"]`)).not.toBeVisible();
  }

  // ---------------------------------------------------------------------------
  // Save Changes (commit preview changes to git)
  // ---------------------------------------------------------------------------

  /** Click "Save Changes" — asserts the button is visible and enabled. */
  async clickSaveChanges() {
    await this.expect(this.saveChangesBtn).toBeVisible();
    await this.expect(this.saveChangesBtn).toBeEnabled();
    await this.saveChangesBtn.click();
  }

  /** Wait for save to complete and the Share version state to refresh. */
  async waitForSaveComplete() {
    await this.expect(this.shareTab).toHaveClass(/bg-main-100/, { timeout: 30_000 });
    await this.expect(
      this.page.getByText("Save this generated version before sharing it.", { exact: true }),
    ).toHaveCount(0, { timeout: 30_000 });
  }

  /**
   * Click "Save Changes" if the button is enabled, then wait for the save to
   * finish.  After preview generation completes, either the Save button
   * becomes enabled (uncommitted changes detected) or the Share tab becomes
   * enabled (no changes).  We race both conditions to avoid waiting for one
   * that will never happen.  After saving, the frontend auto-navigates to the
   * Share tab; we wait for it to become enabled before returning.
   */
  async saveChangesIfNeeded() {
    await this.expect.poll(async () =>
      await this.saveChangesBtn.isEnabled() || await this.shareTab.isEnabled(),
    { timeout: 60_000 }).toBe(true);

    if (!await this.saveChangesBtn.isEnabled()) return;

    await this.saveChangesBtn.click();
    // Frontend auto-navigates to Share tab after save completes.
    // Wait for Share tab to become enabled (changes committed, preview stable).
    await this.expect(this.shareTab).toBeEnabled({ timeout: 60_000 });
  }

  // ---------------------------------------------------------------------------
  // Changes tab
  // ---------------------------------------------------------------------------

  async clickChangesTab() {
    await this.expect(this.changesTab).toBeVisible();
    await this.changesTab.click();
  }

  async clickVersionsTab() {
    await this.expect(this.versionsTab).toBeVisible();
    await this.versionsTab.click();
  }

  async expectVersionsTabActive() {
    await this.expect(this.versionsTab).toHaveClass(/border-main-500/);
  }

  async expectVersionCreatedMessageHidden() {
    await this.expect(this.page.getByText(/^Created v/)).toHaveCount(0);
  }

  async expectSaveChangesVisible() {
    await this.expect(this.saveChangesBtn).toBeVisible();
  }

  async expectSaveChangesHidden() {
    await this.expect(this.saveChangesBtn).toBeHidden();
  }

  async expectCreateNewVersionVisible() {
    await this.expect(this.createNewVersionBtn).toBeVisible();
  }

  async expectCreateNewVersionDisabledForUnsavedVersion() {
    await this.expect(this.createNewVersionBtn).toBeVisible();
    await this.expect(this.createNewVersionBtn).toBeDisabled();
    await this.createNewVersionBtn.hover();
    await this.expect(
      this.page.getByText("Save or cancel the unsaved version before creating another.", { exact: true }),
    ).toBeVisible();
  }

  async expectCreateNewVersionHidden() {
    await this.expect(this.createNewVersionBtn).toBeHidden();
  }

  async openCreateNewVersionDialog() {
    await this.clickVersionsTab();
    await this.expect(this.createNewVersionBtn).toBeVisible();
    await this.expect(this.createNewVersionBtn).toBeEnabled();
    await this.createNewVersionBtn.click();
    await this.expect(this.createVersionDialog).toBeVisible();
  }

  async createConnectedVersion(note: string) {
    await this.createVersionDialog.getByPlaceholder("What changes in this version?").fill(note);
    await this.expect(this.createVersionDialog.getByRole("checkbox")).toHaveCount(0);
    await this.createVersionDialog.getByRole("button", { name: "Create New Version", exact: true }).click();
    await this.expect(this.createVersionDialog).not.toBeVisible({ timeout: 60_000 });
  }

  async expectNoChangeVersionConfirmationRequired() {
    await this.expect(
      this.createVersionDialog.getByText("There are no generated changes. Create a new version anyway."),
    ).toBeVisible({ timeout: 60_000 });
    await this.expect(
      this.createVersionDialog.getByRole("button", { name: "Create New Version", exact: true }),
    ).toBeDisabled({ timeout: 60_000 });
  }

  async expectReaderConnectionCopy() {
    await this.expect(
      this.createVersionDialog.getByText(
        "This creates a new local version from the current source and configuration. It does not publish or perform network operations.",
      ),
    ).toBeVisible();
    await this.expect(this.createVersionDialog.getByText(/provider/i)).toHaveCount(0);
  }

  async confirmNoChangeVersionCreation() {
    await this.createVersionDialog.getByRole("checkbox").last().check();
    await this.expect(this.createVersionDialog.getByRole("button", { name: "Create New Version", exact: true })).toBeEnabled();
  }

  async submitConfirmedNoChangeVersion(note: string) {
    await this.createVersionDialog.getByPlaceholder("What changes in this version?").fill(note);
    await this.createVersionDialog.getByRole("button", { name: "Create New Version", exact: true }).click();
    await this.expect(this.createVersionDialog).not.toBeVisible({ timeout: 60_000 });
  }

  async cancelCurrentVersion() {
    this.page.once("dialog", dialog => dialog.accept());
    const cancelResponsePromise = this.page.waitForResponse(response =>
      response.request().method() === "POST"
      && response.url().endsWith("/review/versions/current/cancel"),
    { timeout: 60_000 });
    await this.page.getByRole("button", { name: "Cancel New Version" }).click();
    const cancelResponse = await cancelResponsePromise;
    this.expect(cancelResponse.ok()).toBe(true);
  }

  async cancelCreateNewVersionDialog() {
    await this.createVersionDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await this.expect(this.createVersionDialog).not.toBeVisible();
  }

  async closeOkfRenameDetails() {
    await this.expect(this.okfRenameModalCloseBtn).toBeVisible();
    await this.okfRenameModalCloseBtn.click();
    await this.expect(this.okfRenameModalHeading).not.toBeVisible();
  }

  async expectOkfRenameDetails(paths: string[]) {
    for (const path of paths) {
      await this.expect(this.page.getByText(path).first()).toBeVisible();
    }
  }

  // ---------------------------------------------------------------------------
  // Step navigation
  // ---------------------------------------------------------------------------

  /** Click step 1 (Review) in the process steps indicator. */
  async clickStep1Review() {
    await this.expect(this.step1ReviewBtn).toBeVisible();
    await this.step1ReviewBtn.click();
  }

  // ---------------------------------------------------------------------------
  // Untracked pages
  // ---------------------------------------------------------------------------

  /** Click the "Check them" link in the untracked pages warning banner. */
  async clickCheckUntrackedPages() {
    await this.expect(this.checkUntrackedPagesBtn).toBeVisible();
    await this.checkUntrackedPagesBtn.click();
  }

  // ---------------------------------------------------------------------------
  // Step assertions
  // ---------------------------------------------------------------------------

  /** Assert the modal is on step 1 (Review) by checking the Bundle Preview tab is visible. */
  async expectOnReviewStep() {
    await this.expect(this.bundlePreviewTab).toBeVisible({ timeout: 30_000 });
  }

  // ---------------------------------------------------------------------------
  // Modal chrome
  // ---------------------------------------------------------------------------

  /** Close the modal by clicking the × button. */
  async closeModal() {
    await this.expect(this.closeBtn).toBeVisible();
    await this.closeBtn.click();
  }

}
