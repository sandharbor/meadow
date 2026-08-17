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
  BundleListPage,
  BundleEditorPage,
  PreviewPublishModal,
} from "./pages/index.js";

// ---------------------------------------------------------------------------
// Typed constants
// ---------------------------------------------------------------------------

/** Home fixture names (used with `test.use({ fixtureHome: ... })`). */
export enum Fixture {
  BigAndSmall = "home_fixture_big_and_small",
  FolderStructureMultiple = "home_fixture_folder_structure_multiple",
  FolderStructureSingle = "home_fixture_folder_structure_single",
  Hooks = "home_fixture_hooks",
  Nested = "home_fixture_nested",
  None = "none",
}

/** Bundle names available in fixtures. */
export enum Bundle {
  Big = "meadow-test-bundle-big",
  FolderStructureMultiple = "ordered-folders",
  FolderStructureSingle = "single-folder-bundle",
  Small = "meadow-test-bundle-small",
  Hooks = "meadow-test-bundle-for-hooks",
  Nested = "meadow-test-bundle-nested",
  Example = "example-bundle",
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
 *   navigateToBigBundle()          → bundle list → editor loaded
 *   navigateToBigBundlePreview()   → … → preview modal, Bundle Preview tab
 *   navigateToBigBundleShareTab()  → … → Share / Publish to Meadow tab
 */
export class Workflows {
  private bundleList: BundleListPage;
  private editor: BundleEditorPage;
  private previewModal: PreviewPublishModal;

  constructor(
    private page: Page,
    private expect: Expect,
  ) {
    this.bundleList = new BundleListPage(page, expect);
    this.editor = new BundleEditorPage(page, expect);
    this.previewModal = new PreviewPublishModal(page, expect);
  }

  /** Navigate to bundle list → open the big bundle → wait for editor to load. */
  async navigateToBigBundle() {
    await this.bundleList.goto();
    await this.bundleList.clickBundle(Bundle.Big);
    await this.editor.waitForLoad(Bundle.Big);
  }

  /** Navigate to bundle list → open the small bundle → wait for editor to load. */
  async navigateToSmallBundle() {
    await this.bundleList.goto();
    await this.bundleList.clickBundle(Bundle.Small);
    await this.editor.waitForLoad(Bundle.Small);
  }

  /** navigateToBigBundle → click Preview → wait for preview to complete. */
  async navigateToBigBundlePreview() {
    await this.navigateToBigBundle();
    await this.editor.clickPreview();
    await this.previewModal.waitForPreviewComplete();
  }

  /** navigateToSmallBundle → click Preview → wait for preview to complete. */
  async navigateToSmallBundlePreview() {
    await this.navigateToSmallBundle();
    await this.editor.clickPreview();
    await this.previewModal.waitForPreviewComplete();
  }

  /** navigateToBigBundlePreview → save changes if needed → click Share tab. */
  async navigateToBigBundleShareTab() {
    await this.navigateToBigBundlePreview();
    await this.previewModal.saveChangesIfNeeded();
    await this.previewModal.clickShareTab();
  }
}
