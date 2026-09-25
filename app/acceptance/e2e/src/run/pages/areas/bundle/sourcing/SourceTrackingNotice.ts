/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Page, Expect } from '@playwright/test';

/** The notice shown after accepting sources when bulk tracking skipped added pages. */
export class SourceTrackingNotice {
  constructor(private page: Page, private expect: Expect) {}

  private get dialog() {
    return this.page.getByRole('dialog', { name: 'Tracking added pages', exact: true });
  }

  async expectSensitiveSkipped(count: number) {
    const pages = count === 1 ? 'page' : 'pages';
    await this.expect(this.dialog.getByText(`Bulk tracking did not track ${count} sensitive ${pages}.`, { exact: true })).toBeVisible();
  }

  /** Select exactly the skipped pages in the editor. */
  async showSkippedPages() {
    await this.dialog.getByRole('button', { name: 'Show them', exact: true }).click();
    await this.expect(this.dialog).not.toBeVisible();
  }
}
