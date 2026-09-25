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
    await this.expect(this.fixture.getByRole('tooltip')).toContainText("Start opens the change's designated scenario fixture");
    await this.expect(this.disclosure.locator('..')).not.toHaveAttribute('open', '');
  }

  async expandChange(id: string, action: string, check: string) {
    const change = this.fixture.getByTestId(`source-change-${id}`);
    await change.locator('summary').click();
    await this.expect(change.getByRole('term')).toHaveText(['Action:', 'Check:', 'E2E:']);
    await this.expect(change.getByRole('definition').nth(0)).toHaveText(action);
    await this.expect(change.getByRole('definition').nth(1)).toHaveText(check);
    await this.expect(change).not.toContainText('Start resets the fixture');
    await this.expect(change).not.toContainText('Applied to the current fixture');
    return change;
  }

  async expectOperations(id: string, operations: unknown[]) {
    const change = this.fixture.getByTestId(`source-change-${id}`);
    this.expect(JSON.parse(await change.locator('pre').innerText())).toEqual(operations);
  }

  async expectE2eRun(id: string, name: string, url: string) {
    const definition = this.fixture.getByTestId(`source-change-${id}`).getByRole('definition').nth(2);
    await this.expect(definition).toContainText('2026-09-21 10:00:00');
    const link = definition.getByRole('link', { name, exact: true });
    await this.expect(link).toHaveAttribute('href', url);
    await this.expect(link).toHaveAttribute('target', '_blank');
  }
}
