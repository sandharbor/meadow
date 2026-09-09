/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Page, Expect } from '@playwright/test';
import { SourceMoveReview } from './SourceMoveReview.js';
import { SourceOrphansReview } from './SourceOrphansReview.js';

/** Source-update review actions and assertions shared by sourcing scenarios. */
export class SourceReviewModal {
  readonly orphans: SourceOrphansReview;

  constructor(private page: Page, private expect: Expect) {
    this.orphans = new SourceOrphansReview(page, expect);
  }

  private get dialog() {
    return this.page.getByRole('dialog', { name: 'Source review', exact: true });
  }

  private detailsButton(path: string) {
    return this.dialog.getByRole('button', { name: `Details ${path}`, exact: true });
  }

  private async comparison(path: string) {
    const contentId = await this.detailsButton(path).getAttribute('aria-controls');
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
  }

  async expectClosed() {
    await this.expect(this.dialog).not.toBeVisible();
  }

  async checkAgain() {
    const check = this.dialog.getByRole('button', { name: 'Check again', exact: true });
    await Promise.all([
      this.page.waitForResponse(response => response.url().includes('/sourcing/scan') && response.request().method() === 'POST' && response.ok()),
      check.click(),
    ]);
    await this.expect(check).toBeEnabled();
  }

  async defer() {
    await this.dialog.getByRole('button', { name: 'Later', exact: true }).click();
    await this.expectClosed();
  }

  async accept() {
    await Promise.all([
      this.page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/curation/working-graph') && response.ok()),
      this.dialog.getByRole('button', { name: 'Accept source update', exact: true }).click(),
    ]);
    await this.expectClosed();
    await this.expect(this.page.getByRole('status').filter({ hasText: 'Recalculating graph…' })).not.toBeVisible();
  }

  async expectModified(path: string) {
    const row = this.detailsButton(path).locator('..');
    await this.expect(row.getByText('Modified', { exact: true })).toBeVisible();
  }

  async expectNoMissingEntry(path: string) {
    await this.expect(this.detailsButton(path)).toHaveCount(0);
  }

  async expectNoRenames() {
    await this.expect(this.dialog.getByRole('heading', { name: /^Renames and moves/ })).not.toBeVisible();
  }

  async expectDetailsCollapsed(path: string) {
    await this.expect(this.detailsButton(path)).toHaveAttribute('aria-expanded', 'false');
    await this.expect(await this.comparison(path)).not.toBeVisible();
  }

  async expandDetails(path: string, activation: 'click' | 'keyboard' = 'click') {
    await this.expectDetailsCollapsed(path);
    const button = this.detailsButton(path);
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
    await this.expect(this.detailsButton(path)).toHaveAttribute('aria-expanded', 'true');
    await this.detailsButton(path).click();
    await this.expectDetailsCollapsed(path);
  }

  async expectContentChanges(path: string, changes: { removed: RegExp; added: RegExp }) {
    const diff = await this.comparison(path);
    await this.expect(diff.getByRole('table', { name: 'Accepted source to Candidate source' })).toBeVisible();
    await this.expect(diff.getByRole('row', { name: changes.removed })).toHaveAttribute('data-change', 'removed');
    await this.expect(diff.getByRole('row', { name: changes.added })).toHaveAttribute('data-change', 'added');
  }

  async moveFrom(originalPath: string) {
    const pathChange = this.page.locator(`[data-testid="source-path-change"][title^=${JSON.stringify(`${originalPath} → `)}]`);
    const row = this.dialog.locator('article').filter({ has: pathChange });
    await this.expect(row).toBeVisible();
    const id = await row.getAttribute('data-testid');
    this.expect(id).toBeTruthy();
    return new SourceMoveReview(this.dialog.getByTestId(id!), this.expect);
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
    await this.expect(this.dialog.getByRole('heading', { name: `Renames and moves (${count})`, exact: true })).toBeVisible();
  }

  async expectMoveListed(nodeId: string) {
    await this.expect(this.dialog.getByTestId(`source-move-${nodeId}`)).toBeVisible();
  }

  async expectReadyToAccept() {
    await this.expect(this.dialog.getByRole('button', { name: 'Accept source update', exact: true })).toBeEnabled();
    await this.expect(this.dialog.getByText('Decide before accepting', { exact: false })).not.toBeVisible();
  }

  async expectFocusTrapped() {
    const close = this.dialog.getByRole('button', { name: 'Close source review', exact: true });
    await this.expect(close).toHaveText('×');
    await this.expect(close).toBeFocused();
    await this.page.keyboard.press('Shift+Tab');
    await this.expect(this.dialog.getByRole('button', { name: 'Accept source update', exact: true })).toBeFocused();
    await this.page.keyboard.press('Tab');
    await this.expect(close).toBeFocused();
  }

  async close() {
    await this.dialog.getByRole('button', { name: 'Close source review', exact: true }).click();
    await this.expectClosed();
  }

  async closeWithEscape() {
    await this.page.keyboard.press('Escape');
    await this.expectClosed();
    await this.expect(this.page.getByTestId('sourcing-status').getByRole('button', { name: /source changes? available.*Review/i })).toBeFocused();
  }

  async expectHistoryAvailable() {
    await this.expect(this.dialog).toContainText('Snapshot details and history');
  }

  async applyOrphanRemovals() {
    await this.accept();
  }

  async reviewOrphans() {
    await this.open();
    const section = this.dialog.getByTestId('source-orphans');
    if (!await section.getByTestId('orphans-view').isVisible()) await section.locator('summary').first().click();
    await this.orphans.waitForOpen();
    return this.orphans;
  }
}
