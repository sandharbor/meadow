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
import {
  SiteListPage,
  SiteEditorPage,
  PreviewPublishModal,
} from "./pages/index.js";

// ---------------------------------------------------------------------------
// Typed constants
// ---------------------------------------------------------------------------

/** Home fixture names (used with `test.use({ fixtureHome: ... })`). */
export enum Fixture {
  BigAndSmall = "home_fixture_big_and_small",
  Hooks = "home_fixture_hooks",
  Nested = "home_fixture_nested",
  None = "none",
}

/** Site names available in fixtures. */
export enum Site {
  Big = "meadow-test-site-big",
  Small = "meadow-test-site-small",
  Hooks = "meadow-test-site-for-hooks",
  Nested = "meadow-test-site-nested",
  Example = "example-site",
}

// ---------------------------------------------------------------------------
// Composable workflow helpers
// ---------------------------------------------------------------------------

/**
 * High-level, composable navigation workflows built from page objects.
 *
 * Each method builds on the previous one, so callers can enter at whatever
 * level of the app they need:
 *
 *   navigateToBigSite()          → site list → editor loaded
 *   navigateToBigSitePreview()   → … → preview modal, Site Preview tab
 *   navigateToBigSiteShareTab()  → … → Share / Publish to Meadow tab
 */
export class Workflows {
  private siteList: SiteListPage;
  private editor: SiteEditorPage;
  private previewModal: PreviewPublishModal;

  constructor(
    private page: Page,
    private expect: Expect,
  ) {
    this.siteList = new SiteListPage(page, expect);
    this.editor = new SiteEditorPage(page, expect);
    this.previewModal = new PreviewPublishModal(page, expect);
  }

  /** Navigate to site list → open the big site → wait for editor to load. */
  async navigateToBigSite() {
    await this.siteList.goto();
    await this.siteList.clickSite(Site.Big);
    await this.editor.waitForLoad(Site.Big);
  }

  /** Navigate to site list → open the small site → wait for editor to load. */
  async navigateToSmallSite() {
    await this.siteList.goto();
    await this.siteList.clickSite(Site.Small);
    await this.editor.waitForLoad(Site.Small);
  }

  /** navigateToBigSite → click Preview → wait for preview to complete. */
  async navigateToBigSitePreview() {
    await this.navigateToBigSite();
    await this.editor.clickPreview();
    await this.previewModal.waitForPreviewComplete();
  }

  /** navigateToBigSitePreview → save changes if needed → click Share tab. */
  async navigateToBigSiteShareTab() {
    await this.navigateToBigSitePreview();
    await this.previewModal.saveChangesIfNeeded();
    await this.previewModal.clickShareTab();
  }
}
