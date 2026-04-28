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

/**
 * Page object for browsing a published Meadow site served by the local S3 proxy.
 */
export class PublishedSitePage {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  // ---------------------------------------------------------------------------
  // Locators
  // ---------------------------------------------------------------------------

  private get mainHeading() {
    return this.page.locator("main h1");
  }

  private get firstMainLink() {
    return this.page.locator("main").getByRole("link").first();
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /** Navigate to the published site URL. */
  async goto(url: string) {
    await this.page.goto(url);
  }

  /** Assert that the main heading is visible. */
  async expectMainHeadingVisible() {
    await this.expect(this.mainHeading).toBeVisible();
  }

  /** Click the first visible link in the main content area. */
  async clickFirstLink() {
    await this.expect(this.firstMainLink).toBeVisible();
    await this.firstMainLink.click();
  }
}
