/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Page, Expect } from '@playwright/test';

export class SourceSnapshotsModal {
  constructor(private page: Page, private expect: Expect) {}

  private get dialog() {
    return this.page.getByRole('dialog', { name: 'Source snapshots', exact: true });
  }

  async expectOpen() {
    await this.expect(this.dialog).toBeVisible();
    await this.expect(this.dialog.getByRole('list', { name: 'Accepted source snapshots' })).toBeVisible();
    await this.expect(this.page.getByRole('dialog', { name: 'Source changes', exact: true })).not.toBeVisible();
  }

  async expectSnapshotCount(count: number) {
    const snapshots = this.dialog.getByRole('list', { name: 'Accepted source snapshots' }).locator(':scope > li');
    await this.expect(snapshots).toHaveCount(count);
    await this.expect(this.dialog.getByText('Current', { exact: true })).toHaveCount(1);
    await this.expect(snapshots.first()).toContainText('Current');
  }

  async close() {
    await this.dialog.getByRole('button', { name: 'Close source snapshots' }).click();
    await this.expect(this.dialog).not.toBeVisible();
  }
}
