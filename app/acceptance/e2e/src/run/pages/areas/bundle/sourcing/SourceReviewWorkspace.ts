/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Page, Expect } from '@playwright/test';
import { SourceMoveReview } from './SourceMoveReview.js';
import { SourceOrphansReview } from './SourceOrphansReview.js';
import { SourceTrackingNotice } from './SourceTrackingNotice.js';
import { SourcingWorkspacePage } from './SourcingWorkspacePage.js';
import { SelectedPageDetailComponent } from '../curation/SelectedPageDetailComponent.js';

/** Source review through the proposal workspace, identity gate, and captured evidence. */
export class SourceReviewWorkspace extends SourcingWorkspacePage {
  readonly orphans: SourceOrphansReview;
  readonly trackingNotice: SourceTrackingNotice;
  constructor(private reviewPage: Page, private reviewExpect: Expect) {
    super(reviewPage, reviewExpect);
    this.orphans = new SourceOrphansReview(reviewPage, reviewExpect, this);
    this.trackingNotice = new SourceTrackingNotice(reviewPage, reviewExpect);
  }
  override async open() {
    if (!await this.root.isVisible()) await super.open();
    await this.reviewExpect(this.root).toBeVisible();
  }
  async expectClosed() { await this.reviewExpect(this.root).not.toBeVisible(); }
  async checkAgain() {
    await this.reviewExpect(this.refreshSourcesButton).toBeEnabled();
    await this.closeInspection();
    if (await this.identities.isVisible()) {
      await Promise.all([
        this.reviewPage.waitForResponse(response => response.url().endsWith('/sourcing/proposal/refresh') && response.ok()),
        this.identities.getByRole('button', { name: 'Refresh sources', exact: true }).click(),
      ]);
    } else await this.updateSources();
  }
  async expectRefreshInHeader() {
    await this.reviewExpect(this.refreshSourcesButton).toBeVisible();
  }
  private async closeInspection() {
    if (await this.comparison.isVisible()) await this.closeComparison();
  }
  async defer() { await this.closeInspection(); if (await this.identities.isVisible()) await this.identities.getByRole('button', { name: 'Later', exact: true }).click(); else await this.later(); }
  override async discard() {
    await this.closeInspection();
    await super.discard();
    await this.expectClosed();
  }
  async close() { await this.defer(); }
  override async accept() {
    await this.closeInspection();
    if (await this.identities.isVisible()) await this.continueToGraph();
    await super.accept();
    await this.reviewExpect(this.reviewPage.getByRole('status').filter({ hasText: 'Recalculating graph…' })).not.toBeVisible();
  }
  async confirmSuggestedIdentities() {
    await this.reviewExpect(this.identities).toBeVisible();
    await this.acceptAllIdentitySuggestions();
    await this.reviewExpect(this.identities.getByRole('button', { name: 'Continue to graph', exact: true })).toBeEnabled();
  }
  private async selectPath(path: string) {
    await this.closeInspection();
    await this.root.getByRole('button', { name: 'List View', exact: true }).click();
    const deselect = this.root.getByTitle('Deselect', { exact: true });
    while (await deselect.count()) await deselect.first().click();
    await this.root.locator(`tr[data-bundle-node-key=${JSON.stringify(`file:${path}`)}]`).click();
    await this.reviewExpect(this.selectedPage).toBeVisible();
  }
  async expectSensitivity(path: string, label: 'Sensitive' | 'Sensitive via filter') {
    await this.selectPath(path);
    await this.reviewExpect(this.selectedPage.getByText('Sensitive', { exact: true })).toBeVisible();
    if (label === 'Sensitive via filter') await this.reviewExpect(this.evidence).toContainText(/filter .* marks this page sensitive/);
  }
  async expectModified(path: string) { await this.selectPath(path); await this.reviewExpect(this.evidence).toContainText('Change: Modify'); }
  async expectAdded(path: string) { await this.selectPath(path); await this.reviewExpect(this.evidence).toContainText('Change: Add'); }
  async previewImage(path: string, route: string[]) {
    await this.selectPath(path);
    await new SelectedPageDetailComponent(this.selectedPage, this.reviewExpect).openDetails();
    for (const filename of route) await this.reviewExpect(this.selectedPage.getByTestId('selected-node-details').getByText(filename.replace(/\.md$/, ''), { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await this.expandDetails(path);
    const image = this.comparison.getByRole('img', { name: 'after captured source', exact: true });
    await this.reviewExpect(image).toBeVisible();
    await this.reviewExpect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  async expectImageComparison(_path: string) {
    const previous = this.comparison.getByRole('img', { name: 'before captured source', exact: true });
    const next = this.comparison.getByRole('img', { name: 'after captured source', exact: true });
    for (const image of [previous, next]) {
      await this.reviewExpect(image).toBeVisible();
      await this.reviewExpect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    this.reviewExpect(await previous.getAttribute('src')).not.toBe(await next.getAttribute('src'));
  }
  async expectNoLongerIncluded(path: string) { await this.selectPath(path); await this.reviewExpect(this.evidence).toContainText('Change: Remove'); }
  async expectNoRenames() { await this.expectNoIdentityDecisions(); }
  async expandDetails(path: string, activation: 'click' | 'keyboard' = 'click') {
    await this.selectPath(path);
    const button = this.root.getByRole('button', { name: /^(See content|See changes|See file content changes|See previous content)$/ });
    if (activation === 'keyboard') await button.press('Enter'); else await button.click();
    await this.reviewExpect(this.comparison.getByRole('region', { name: 'Source content comparison', exact: true })).toBeVisible();
  }
  async collapseDetails(_path: string) { await this.closeComparison(); }
  async expectContentChanges(_path: string, changes: { removed: RegExp; added: RegExp }) {
    await this.reviewExpect(this.comparison.getByRole('table', { name: 'Accepted source to Proposed source' })).toBeVisible();
    await this.reviewExpect(this.comparison.getByRole('row').filter({ hasText: changes.removed })).toHaveAttribute('data-change', 'removed');
    await this.reviewExpect(this.comparison.getByRole('row').filter({ hasText: changes.added })).toHaveAttribute('data-change', 'added');
  }
  async expectInlineChanges(_path: string, removed: string[], added: string[]) {
    await this.reviewExpect(this.comparison.locator('[data-inline-change="removed"]')).toHaveText(removed);
    await this.reviewExpect(this.comparison.locator('[data-inline-change="added"]')).toHaveText(added);
  }
  async moveFrom(originalPath: string) {
    const change = this.reviewPage.locator(`[data-testid="source-path-change"][title^=${JSON.stringify(`${originalPath} → `)}]`);
    const row = this.identities.locator('fieldset').filter({ has: change });
    await this.showIdentityRecord(row);
    return new SourceMoveReview(row, this.reviewExpect, this.reviewPage);
  }
  async moveForNode(id: string) {
    const row = this.identities.getByTestId(`source-move-${id}`);
    await this.showIdentityRecord(row);
    return new SourceMoveReview(row, this.reviewExpect, this.reviewPage);
  }
  async expectIdentityChoiceRequired() { await this.reviewExpect(this.identities.getByRole('button', { name: 'Continue to graph', exact: true })).toBeDisabled(); }
  async expectMove(kind: 'Renamed' | 'Moved' | 'Moved and renamed', before: string, after: string) {
    await this.showIdentityRecord(this.identities.getByRole('group', { name: `${kind}: ${before} → ${after}`, exact: true, includeHidden: true }));
  }
  async expectMoveCount(count: number) { await this.reviewExpect(this.identities.locator('fieldset[data-testid^="source-move-"]')).toHaveCount(count); }
  async expectMoveListed(nodeId: string) { await this.showIdentity(nodeId); }
  async expectReadyToAccept() { await this.reviewExpect(this.root.getByRole('button', { name: 'Accept changes', exact: true })).toBeEnabled(); }
  async applyOrphanRemovals() { await this.accept(); }
  async reviewOrphans() { await this.open(); await this.closeInspection(); await this.orphans.waitForOpen(); return this.orphans; }
}
