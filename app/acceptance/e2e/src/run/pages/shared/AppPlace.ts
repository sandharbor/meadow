/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Expect, Page } from "@playwright/test";

/** App Places as a scenario sees them: links in, the published place, and the arrival callout. */
export class AppPlace {
  constructor(private page: Page, private expect: Expect) {}

  /** Follow a link into the app, as the CLI or Dev Tools would. */
  async open(path: string) {
    await this.page.goto(path);
  }

  /** Follow a link within the running app, as a desktop meadow:// link arrives. */
  async followInApp(path: string) {
    await this.page.evaluate(target => {
      window.history.pushState(null, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, path);
  }

  async current(): Promise<string | undefined> {
    return await this.page.evaluate(() => document.documentElement.dataset.meadowPlace);
  }

  async expectCurrent(path: string) {
    await this.expect.poll(() => this.current()).toBe(path);
  }

  async expectCurrentMatching(pattern: RegExp) {
    await this.expect.poll(() => this.current()).toMatch(pattern);
  }

  /** Browser Back and Forward, as a person would use them. */
  async back() {
    await this.page.goBack();
  }

  async forward() {
    await this.page.goForward();
  }

  /** The address bar, which shows only history places. */
  async expectUrlMatching(pattern: RegExp) {
    await this.expect.poll(() => { const url = new URL(this.page.url()); return `${url.pathname}${url.search}`; }).toMatch(pattern);
  }

  private get callout() {
    return this.page.getByTestId("place-arrival-callout");
  }

  async expectArrivalCallout(text: string) {
    await this.expect(this.callout).toHaveText(text);
  }

  async expectNoArrivalCallout() {
    await this.expect(this.callout).toHaveCount(0);
  }

  async dismissArrivalCallout() {
    await this.callout.getByRole("button", { name: "Dismiss" }).click();
    await this.expect(this.callout).toHaveCount(0);
  }
}
