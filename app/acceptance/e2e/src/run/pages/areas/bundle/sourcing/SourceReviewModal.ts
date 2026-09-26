/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Page, Expect } from '@playwright/test';
import { SourceMoveReview } from './SourceMoveReview.js';
import { SourceOrphansReview } from './SourceOrphansReview.js';
import { SourceTrackingNotice } from './SourceTrackingNotice.js';

/** Source-update review actions and assertions shared by sourcing scenarios. */
export class SourceReviewModal {
  readonly orphans: SourceOrphansReview;
  /** Appears after acceptance when bulk tracking skipped added pages. */
  readonly trackingNotice: SourceTrackingNotice;

  constructor(private page: Page, private expect: Expect) {
    this.orphans = new SourceOrphansReview(page, expect);
    this.trackingNotice = new SourceTrackingNotice(page, expect);
  }

  private get dialog() {
    return this.page.getByRole('dialog', { name: 'Source changes', exact: true });
  }

  private get trackNewPagesCheckbox() {
    return this.dialog.getByRole('checkbox', { name: 'Track non-sensitive added pages', exact: true });
  }

  async expectTrackNewPages(checked: boolean) {
    await this.expect(this.trackNewPagesCheckbox).toBeVisible();
    await this.expect(this.trackNewPagesCheckbox).toBeChecked({ checked });
  }

  async setTrackNewPages(checked: boolean) {
    await this.trackNewPagesCheckbox.setChecked(checked);
  }

  private changeDisclosure(path: string) {
    return this.dialog.getByRole('region', { name: 'Source content changes', exact: true })
      .locator(`summary[aria-label=${JSON.stringify(`Details ${path}`)}]`);
  }

  private async comparison(path: string) {
    const contentId = await this.changeDisclosure(path).getAttribute('aria-controls');
    this.expect(contentId, `Details for ${path} must identify its content panel`).toBeTruthy();
    return this.dialog.locator(`[id=${JSON.stringify(contentId)}]`)
      .getByRole('region', { name: 'Source content comparison' });
  }

  async open() {
    if (!await this.dialog.isVisible()) {
      await this.page.getByTestId('sourcing-status')
        .getByRole('button', { name: /source changes? available.*Review/i }).click();
    }
    await this.expect(this.dialog).toBeVisible();
    await this.expect(this.dialog.getByText(/Snapshot details and history/)).not.toBeVisible();
  }

  async expectClosed() {
    await this.expect(this.dialog).not.toBeVisible();
  }

  async checkAgain() {
    const check = this.dialog.getByRole('button', { name: 'Refresh sources', exact: true });
    await Promise.all([
      this.page.waitForResponse(response => response.url().includes('/sourcing/scan') && response.request().method() === 'POST' && response.ok()),
      check.click(),
    ]);
    await this.expect(check).toBeEnabled();
  }

  async expectRefreshInHeader() {
    const title = this.dialog.getByRole('heading', { name: 'Source changes', exact: true });
    const refresh = this.dialog.getByRole('button', { name: 'Refresh sources', exact: true });
    await this.expect(title).toHaveCount(1);
    const titleBounds = await title.boundingBox();
    const refreshBounds = await refresh.boundingBox();
    this.expect(titleBounds).not.toBeNull();
    this.expect(refreshBounds).not.toBeNull();
    this.expect(Math.abs(titleBounds!.y - refreshBounds!.y)).toBeLessThan(10);
  }

  async defer() {
    await this.dialog.getByRole('button', { name: 'Later', exact: true }).click();
    await this.expectClosed();
  }

  async accept() {
    await Promise.all([
      this.page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/curation/working-graph') && response.ok()),
      this.dialog.getByRole('button', { name: 'Accept source changes', exact: true }).click(),
    ]);
    await this.expectClosed();
    await this.expect(this.page.getByRole('status').filter({ hasText: 'Recalculating graph…' })).not.toBeVisible();
  }

  async expectSensitivity(path: string, label: 'Sensitive' | 'Sensitive via filter') {
    await this.expect(this.changeDisclosure(path).getByText(label, { exact: true })).toBeVisible();
  }

  async expectModified(path: string) {
    const row = this.changeDisclosure(path);
    await this.expect(row.getByText('Modified', { exact: true })).toBeVisible();
  }

  async previewImage(path: string, route: string[]) {
    await this.dialog.getByRole('button', { name: `Preview ${path}`, exact: true }).hover();
    const tooltip = this.page.getByRole('tooltip');
    await this.expect(tooltip.getByRole('img', { name: path, exact: true })).toBeVisible();
    await this.expect(tooltip).toContainText('Reached through · Candidate source');
    for (const filename of route) await this.expect(tooltip.getByTestId('source-file-pill').filter({ hasText: filename })).toBeVisible();
  }

  async expectImageComparison(path: string) {
    const comparison = await this.comparison(path);
    const previous = comparison.getByRole('img', { name: `Previous image: ${path}`, exact: true });
    const next = comparison.getByRole('img', { name: `New image: ${path}`, exact: true });
    await this.expect(previous).toBeVisible();
    await this.expect(next).toBeVisible();
    // Verify both pictures loaded, not just their wrappers or alt text.
    for (const image of [previous, next]) await this.expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    this.expect(await previous.getAttribute('src')).not.toBe(await next.getAttribute('src'));
  }

  async expectNoLongerIncluded(path: string) {
    const row = this.changeDisclosure(path);
    await this.expect(row.getByText('No longer included', { exact: true })).toBeVisible();
    await this.expect(row.getByText('Missing', { exact: true })).toHaveCount(0);
  }

  async expectNoMissingEntry(path: string) {
    await this.expect(this.changeDisclosure(path)).toHaveCount(0);
  }

  async expectNoRenames() {
    await this.expect(this.dialog.getByRole('heading', { name: /^Renames and moves/ })).not.toBeVisible();
  }

  async expectDetailsCollapsed(path: string) {
    await this.expect(this.changeDisclosure(path)).toHaveAttribute('aria-expanded', 'false');
    await this.expect(await this.comparison(path)).not.toBeVisible();
  }

  async expandDetails(path: string, activation: 'click' | 'keyboard' = 'click') {
    await this.expectDetailsCollapsed(path);
    const button = this.changeDisclosure(path);
    if (activation === 'keyboard') {
      await button.focus();
      await this.page.keyboard.press('Enter');
    } else {
      await button.click();
    }
    await this.expect(button).toHaveAttribute('aria-expanded', 'true');
    await this.expect(await this.comparison(path)).toBeVisible();
  }

  async collapseDetails(path: string) {
    await this.expect(this.changeDisclosure(path)).toHaveAttribute('aria-expanded', 'true');
    await this.changeDisclosure(path).click();
    await this.expectDetailsCollapsed(path);
  }

  async expectContentChanges(path: string, changes: { removed: RegExp; added: RegExp }) {
    const diff = await this.comparison(path);
    await this.expect(diff.getByRole('table', { name: 'Accepted source to Candidate source' })).toBeVisible();
    await this.expect(diff.getByRole('row').filter({ hasText: changes.removed })).toHaveAttribute('data-change', 'removed');
    await this.expect(diff.getByRole('row').filter({ hasText: changes.added })).toHaveAttribute('data-change', 'added');
  }

  async expectInlineChanges(path: string, removed: string[], added: string[]) {
    const diff = await this.comparison(path);
    await this.expect(diff.locator('[data-inline-change="removed"]')).toHaveText(removed);
    await this.expect(diff.locator('[data-inline-change="added"]')).toHaveText(added);
  }

  async moveFrom(originalPath: string) {
    const pathChange = this.page.locator(`[data-testid="source-path-change"][title^=${JSON.stringify(`${originalPath} → `)}]`);
    const row = this.dialog.locator('article').filter({ has: pathChange });
    await this.expect(row).toBeVisible();
    const id = await row.getAttribute('data-testid');
    this.expect(id).toBeTruthy();
    return new SourceMoveReview(this.dialog.getByTestId(id!), this.expect);
  }

  async moveForNode(id: string) {
    const row = this.dialog.getByTestId(`source-move-${id}`);
    await this.expect(row).toBeVisible();
    return new SourceMoveReview(row, this.expect);
  }

  async expectIdentityChoiceRequired() {
    await this.expect(this.dialog.getByRole('button', { name: 'Accept source changes', exact: true })).toBeDisabled();
    await this.expect(this.dialog.getByRole('status')).toContainText('Decide before accepting');
  }

  async keepRenameSeparate(originalPath: string) {
    const move = await this.moveFrom(originalPath);
    await move.expandDetails();
    await move.keepSeparate();
  }

  async expectMove(kind: 'Renamed' | 'Moved' | 'Moved and renamed', before: string, after: string) {
    await this.expect(this.dialog.getByRole('group', { name: `${kind}: ${before} → ${after}`, exact: true })).toBeVisible();
  }

  async expectMoveCount(count: number) {
    await this.expect(this.dialog.locator('article[data-testid^="source-move-"]')).toHaveCount(count);
    await this.expect(this.dialog.getByRole('heading', { name: count >= 10 ? `Renames and moves (${count})` : 'Renames and moves', exact: true })).toBeVisible();
  }

  async expectMoveListed(nodeId: string) {
    await this.expect(this.dialog.getByTestId(`source-move-${nodeId}`)).toBeVisible();
  }

  async expectReadyToAccept() {
    await this.expect(this.dialog.getByRole('button', { name: 'Accept source changes', exact: true })).toBeEnabled();
    await this.expect(this.dialog.getByText('Decide before accepting', { exact: false })).not.toBeVisible();
  }

  async expectFocusTrapped() {
    const close = this.dialog.getByRole('button', { name: 'Close source changes', exact: true });
    await this.expect(close).toHaveText('×');
    const refresh = this.dialog.getByRole('button', { name: 'Refresh sources', exact: true });
    await this.expect(refresh).toBeFocused();
    await this.page.keyboard.press('Shift+Tab');
    await this.expect(this.dialog.getByRole('button', { name: 'Accept source changes', exact: true })).toBeFocused();
    await this.page.keyboard.press('Tab');
    await this.expect(refresh).toBeFocused();
  }

  async close() {
    await this.dialog.getByRole('button', { name: 'Close source changes', exact: true }).click();
    await this.expectClosed();
  }

  async closeWithEscape() {
    await this.page.keyboard.press('Escape');
    await this.expectClosed();
    await this.expect(this.page.getByTestId('sourcing-status').getByRole('button', { name: /source changes? available.*Review/i })).toBeFocused();
  }

  async applyOrphanRemovals() {
    await this.accept();
  }

  async reviewOrphans() {
    await this.open();
    await this.orphans.waitForOpen();
    return this.orphans;
  }
}
