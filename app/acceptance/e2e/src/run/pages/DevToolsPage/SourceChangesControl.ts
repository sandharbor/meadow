/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Locator, Expect } from '@playwright/test';

export class DevSourceChangesControl {
  constructor(private fixture: Locator, private expect: Expect) {}

  private get disclosure() {
    return this.fixture.locator('summary[aria-label="Source changes"]');
  }

  async open() {
    await this.disclosure.click();
    await this.expect(this.fixture.getByTestId('source-changes-control')).toBeVisible();
  }

  async checkHelpWhileClosed() {
    await this.fixture.getByRole('button', { name: 'About source changes' }).click();
    await this.expect(this.fixture.getByRole('tooltip')).toContainText('Start scenario resets this fixture');
    await this.expect(this.disclosure.locator('..')).not.toHaveAttribute('open', '');
  }
}
