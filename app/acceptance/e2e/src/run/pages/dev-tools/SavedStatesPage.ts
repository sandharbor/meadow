/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Expect, Locator, Page } from '@playwright/test';

/** Dev Tools' saved-state cards and its "What am I QA-ing?" panel. */
export class DevSavedStatesPage {
  constructor(private page: Page, private expect: Expect) {}

  card(name: string): Locator {
    return this.page.getByTestId(`fixture-card-${name}`);
  }

  private get panel(): Locator {
    return this.page.getByTestId('qa-panel');
  }

  async useBrowserLaunches() {
    await this.page.getByRole('button', { name: 'Browser', exact: true }).click();
  }

  async openCard(name: string, label: string) {
    await Promise.all([
      this.page.waitForResponse(response => response.url().endsWith('/api/saved-states/open') && response.ok(), { timeout: 120_000 }),
      this.card(name).getByRole('button', { name: `Open ${label} with Local`, exact: true }).click(),
    ]);
  }

  async expectHostedOnlyWithReason(name: string, label: string, reason: string) {
    const card = this.card(name);
    await card.getByRole('button', { name: `More ways to open ${label}`, exact: true }).click();
    const local = card.getByRole('menuitem', { name: /Local/ });
    await this.expect(local).toBeDisabled();
    await this.expect(local).toContainText(reason);
    await card.getByRole('button', { name: `More ways to open ${label}`, exact: true }).click();
  }

  async expectOpen(expected: { origin: string | RegExp; services: string | RegExp; checkpoint?: string | RegExp; code?: string | RegExp }) {
    await this.expect(this.panel.getByTestId('qa-origin')).toHaveText(expected.origin);
    await this.expect(this.panel.getByTestId('qa-service-target')).toContainText(expected.services);
    if (expected.checkpoint) await this.expect(this.panel.getByTestId('qa-checkpoint')).toContainText(expected.checkpoint);
    if (expected.code) await this.expect(this.panel.getByTestId('qa-code')).toHaveText(expected.code);
  }

  async openHome(): Promise<string> {
    return await this.panel.getByTestId('qa-home').innerText();
  }
}
