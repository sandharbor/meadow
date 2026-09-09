/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Locator, Expect } from '@playwright/test';

/** A single proposed identity match within source review. */
export class SourceMoveReview {
  constructor(private row: Locator, private expect: Expect) {}

  async expectDetailsCollapsed() {
    await this.expect(this.row.getByRole('radio')).not.toBeVisible();
    await this.expect(this.row.getByText('Identical file contents', { exact: false })).not.toBeVisible();
    await this.expect(this.row.getByRole('button', { name: /^Compare content/ })).not.toBeVisible();
  }

  async expandDetails() {
    await this.row.getByText('Details', { exact: true }).click();
    await this.expect(this.row.getByRole('group', { name: 'Page identity', exact: true })).toBeVisible();
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
    await this.expect(this.row.getByRole('definition').filter({ hasText: path }).first()).toBeVisible();
  }

  async compareContent() {
    await this.row.getByRole('button', { name: 'Compare content', exact: true }).click();
    await this.expect(this.row.getByRole('region', { name: 'Source content comparison' })).toBeVisible();
  }

  async expectNoContentChanges() {
    await this.expect(this.row.getByRole('region', { name: 'Source content comparison' })).toContainText('No content changes');
  }
}
