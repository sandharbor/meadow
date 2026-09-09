/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Locator, Expect } from '@playwright/test';

/** A single proposed identity match within source review. */
export class SourceMoveReview {
  constructor(private row: Locator, private expect: Expect) {}

  async expectDetailsCollapsed() {
    await this.expect(this.row.locator('details').first()).not.toHaveAttribute('open', '');
    await this.expect(this.row.getByRole('radio')).not.toBeVisible();
    await this.expect(this.row.getByText('Identical file contents', { exact: false })).not.toBeVisible();
    await this.expect(this.row.getByRole('button', { name: /^Compare content/ })).not.toBeVisible();
  }

  async expandDetails(activation: 'click' | 'keyboard' = 'click') {
    const disclosure = this.row.locator('summary').first();
    if (activation === 'keyboard') await disclosure.press('Enter');
    else await disclosure.click();
    await this.expect(this.row.getByRole('group', { name: 'Page identity', exact: true })).toBeVisible();
  }

  async collapseDetails() {
    await this.row.locator('summary').first().click();
    await this.expectDetailsCollapsed();
  }

  async expectSamePageSelected() {
    await this.expect(this.row.getByRole('radio', { name: /Same page/ })).toBeChecked();
  }

  async keepSeparate() {
    await this.row.getByRole('radio', { name: /Different pages/ }).check();
    await this.expectSeparateSelected();
  }

  async expectSeparateSelected() {
    await this.expect(this.row.getByRole('radio', { name: /Different pages/ })).toBeChecked();
    await this.expect(this.row.getByText('Separate pages', { exact: true })).toBeVisible();
  }

  async expectPreviousRoute(path: string) {
    await this.row.getByText('Traversal details', { exact: true }).click();
    await this.expect(this.row.getByTestId('source-file-pill').filter({ hasText: path }).first()).toBeVisible();
  }

  async compareContent() {
    await this.row.getByRole('button', { name: 'Compare content', exact: true }).click();
    await this.expect(this.row.getByRole('region', { name: 'Source content comparison' })).toBeVisible();
  }

  async expectContentEdit(before: string, after: string) {
    const diff = this.row.getByRole('region', { name: 'Source content comparison' });
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
