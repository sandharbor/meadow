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

export class PreviewPublishModal {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  // ---------------------------------------------------------------------------
  // Locators — define each UI concept once
  // ---------------------------------------------------------------------------

  private get sitePreviewTab() {
    return this.page.locator("button", { hasText: "Site Preview" });
  }

  private get shareTab() {
    return this.page.locator("button", { hasText: "Share" });
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

  private get closeBtn() {
    return this.page.locator(".absolute.top-3.right-4 button");
  }

  private get previewIframe() {
    return this.page.frameLocator('iframe[title="Preview"]');
  }

  private get previewIframeH1() {
    return this.previewIframe.locator("h1").first();
  }

  private get inviteCodeToggle() {
    return this.page.getByText("I have an invite code");
  }

  private get inviteCodeInput() {
    return this.page.getByPlaceholder("12-character code");
  }

  private get redeemBtn() {
    return this.page.locator("button", { hasText: "Redeem" });
  }

  private get publishNewSiteBtn() {
    return this.page.locator("button", { hasText: "Publish New Site" });
  }

  private get changesTab() {
    return this.page.locator("nav button", { hasText: "Changes" }).first();
  }

  private get step1ReviewBtn() {
    return this.page.locator("button", { hasText: /^\d+\s*Review$/ });
  }

  private get checkUntrackedPagesBtn() {
    return this.page.locator("button", { hasText: /Check (them|it)/ });
  }

  // ---------------------------------------------------------------------------
  // Preview completion
  // ---------------------------------------------------------------------------

  async waitForPreviewComplete() {
    await this.expect(this.page.getByText(/untracked page/)).toBeVisible({
      timeout: 30_000,
    });
  }

  /** Wait for preview to finish when the site has no untracked pages. */
  async waitForPreviewCompleteAllTracked() {
    await this.expect(this.sitePreviewTab).toBeVisible({ timeout: 60_000 });
  }

  // ---------------------------------------------------------------------------
  // Tab navigation
  // ---------------------------------------------------------------------------

  async clickShareTab() {
    await this.expect(this.shareTab).toBeEnabled({ timeout: 60_000 });
    await this.shareTab.click();
  }

  async clickSitePreviewTab() {
    await this.expect(this.sitePreviewTab).toBeVisible();
    await this.sitePreviewTab.click();
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
   * removed from the generated site.
   */
  async expectPreviewLinkNotVisible(href: string) {
    await this.expect(this.previewIframe.locator(`a[href="${href}"]`)).not.toBeVisible();
  }

  // ---------------------------------------------------------------------------
  // Invite code
  // ---------------------------------------------------------------------------

  /** Expand the "I have an invite code" section. */
  async expandInviteCodeForm() {
    await this.inviteCodeToggle.click();
    await this.expect(this.inviteCodeInput).toBeVisible();
  }

  /** Fill the invite code input field. */
  async fillInviteCode(code: string) {
    await this.inviteCodeInput.fill(code);
  }

  /** Assert the Redeem button is enabled. */
  async expectRedeemEnabled() {
    await this.expect(this.redeemBtn).toBeEnabled();
  }

  /** Assert the Redeem button is disabled. */
  async expectRedeemDisabled() {
    await this.expect(this.redeemBtn).toBeDisabled();
  }

  /** Click the Redeem button. */
  async clickRedeem() {
    await this.redeemBtn.click();
  }

  /** Assert the "Publish New Site" button is visible (post-redemption). */
  async expectPublishNewSiteVisible(timeout = 15_000) {
    await this.expect(this.publishNewSiteBtn).toBeVisible({ timeout });
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

  /** Wait for save to complete.  After saving, the frontend auto-navigates to
   *  the Share tab, so the Save button may no longer be visible.  We wait for
   *  the Share tab to become enabled as the definitive "save done" signal. */
  async waitForSaveComplete() {
    await this.expect(this.shareTab).toBeEnabled({ timeout: 30_000 });
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
    // Race: wait for either Save to become enabled (changes exist) or
    // Share to become enabled (no changes / already saved).
    // Use 60s timeout: under heavy parallel load the changed-files fetch
    // (which enables the Save button) can take well over 30s.
    const saveNeeded = this.expect(this.saveChangesBtn).toBeEnabled({ timeout: 60_000 })
      .then(() => 'save' as const).catch(() => 'no' as const);
    const shareReady = this.expect(this.shareTab).toBeEnabled({ timeout: 60_000 })
      .then(() => 'share' as const).catch(() => 'no' as const);

    const winner = await Promise.race([saveNeeded, shareReady]);

    if (winner !== 'save') return;

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

  /** Assert the modal is on step 1 (Review) by checking the Site Preview tab is visible. */
  async expectOnReviewStep() {
    await this.expect(this.sitePreviewTab).toBeVisible({ timeout: 30_000 });
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
