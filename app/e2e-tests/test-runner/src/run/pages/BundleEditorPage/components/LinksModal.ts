/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import type { Page, Expect } from "@playwright/test";

export class LinksModal {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  // --- Private getters ---

  private modalTitle(text: string) {
    return this.page.locator("h2", { hasText: text });
  }

  private get notInGraphLabels() {
    return this.page.locator("text=Not in graph");
  }

  private get infoIcon() {
    return this.page.locator(".group\\/info svg").first();
  }

  private get beyondOutlinksDepthTooltip() {
    return this.page.locator("text=The target page is beyond the outlinks depth");
  }

  // --- Actions ---

  async expectModalTitle(text: string) {
    await this.expect(this.modalTitle(text)).toBeVisible();
  }

  async expectNotInGraphVisible() {
    await this.expect(this.notInGraphLabels.first()).toBeVisible();
  }

  async hoverInfoIcon() {
    await this.infoIcon.hover();
  }

  async expectBeyondOutlinksDepthTooltip() {
    await this.expect(this.beyondOutlinksDepthTooltip.first()).toBeVisible();
  }

  async clickInlinkLinks(inlinkText: string) {
    const inlinkLinksButton = this.page
      .locator(`div:has(> div > .text-sm:has-text("${inlinkText}"))`)
      .locator('button:has-text("Links")')
      .first();
    await this.expect(inlinkLinksButton).toBeVisible();
    await inlinkLinksButton.click();
  }
}
