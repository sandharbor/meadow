/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Locator, Expect, Page } from '@playwright/test';

/** A single proposed identity match within source review. */
export class SourceMoveReview {
  constructor(private row: Locator, private expect: Expect, private page: Page) {}

  async expectSamePageSelected() {
    await this.expect(this.row.getByRole('radio', { name: /Same page/ })).toBeChecked();
  }

  async expectUnresolved(destinations: string[]) {
    await this.expect(this.row.getByRole('radio', { checked: true })).toHaveCount(0);
    const choices = this.row.getByRole('radio', { name: /Same page/ });
    await this.expect(choices).toHaveCount(destinations.length);
    for (const destination of destinations) await this.expect(this.row.getByRole('radio', { name: new RegExp(destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
  }

  async keepSeparate() {
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/identities') && response.ok()),
      this.row.getByRole('radio', { name: /Different pages/ }).click(),
    ]);
    await this.expectSeparateSelected();
  }

  async expectSeparateSelected() {
    await this.expect(this.row.getByRole('radio', { name: /Different pages/ })).toBeChecked();
  }

  async expectPreviousRoute(path: string) {
    await this.row.getByText('Traversal details', { exact: true }).click();
    await this.expect(this.row.getByTestId('source-file-pill').filter({ hasText: path }).first()).toBeVisible();
  }

  async compareContent() {
    await this.row.getByRole('button', { name: 'Compare content', exact: true }).click();
    await this.expect(this.page.getByRole('dialog', { name: 'Captured source comparison', exact: true }).getByRole('region', { name: 'Source content comparison' })).toBeVisible();
  }

  async expectContentEdit(before: string, after: string) {
    const diff = this.page.getByRole('dialog', { name: 'Captured source comparison', exact: true }).getByRole('region', { name: 'Source content comparison' });
    await this.expect(diff.getByRole('row').filter({ hasText: before })).toHaveAttribute('data-change', 'removed');
    await this.expect(diff.getByRole('row').filter({ hasText: after })).toHaveAttribute('data-change', 'added');
  }

  async expectNoContentComparison() {
    await this.expect(this.row.getByRole('button', { name: /^Compare content/ })).toHaveCount(0);
  }

  async expectSingleRoute(paths: string[]) {
    await this.row.getByText('Traversal details', { exact: true }).click();
    const pills = this.row.getByTestId('source-file-pill');
    await this.expect(pills).toHaveCount(paths.length);
    for (const [index, path] of paths.entries()) await this.expect(pills.nth(index)).toHaveAttribute('title', path);
    await this.expect(this.row.getByRole('term')).toHaveCount(0);
  }
}
