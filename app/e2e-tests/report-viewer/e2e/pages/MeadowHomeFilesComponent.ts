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

import type { Page, Expect, Locator } from "@playwright/test";

/**
 * The MeadowHome Files tab within the ScenarioViewer. Encapsulates
 * selectors and assertions against the file tree so specs don't have to
 * know about DOM structure.
 *
 * Selectors rely on two stable data attributes that are set on every
 * file leaf in tick mode:
 *   - data-file-path    — the full path (e.g. "app/app_config.yaml")
 *   - data-file-status  — one of "committed", "just-committed",
 *                         "uncommitted-new", "uncommitted-modified", "removed"
 *   - data-file-ignored — "true" if the file matches a .gitignore rule in
 *                         the MeadowHome repo at the current tick, absent
 *                         otherwise. Drives the "light grey" visual
 *                         treatment for gitignored per-instance files
 *                         like app/secret_app_config.yaml and
 *                         app/resources.local.yaml.
 */
export class MeadowHomeFilesComponent {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  private get tabButton() {
    return this.page.getByRole("button", { name: "Files", exact: true });
  }

  /** Switch to the Files tab. Idempotent. */
  async activate(): Promise<void> {
    await this.tabButton.click();
  }

  /** Locator for the file tree entry at the given path. */
  fileEntry(path: string): Locator {
    return this.page.locator(`[data-file-path="${path}"]`);
  }

  /**
   * Assert that a file exists in the tree and is NOT marked as modified
   * (uncommitted). Useful for pinning down false-positive "modified"
   * indicators.
   */
  async expectFileNotModified(path: string): Promise<void> {
    const entry = this.fileEntry(path);
    await this.expect(
      entry,
      `file "${path}" should be present in the MeadowHome files tree at the current tick`,
    ).toBeVisible();
    const status = await entry.getAttribute("data-file-status");
    this.expect(
      status,
      `file "${path}" should NOT be marked uncommitted-modified at the current tick (actual data-file-status: ${status})`,
    ).not.toBe("uncommitted-modified");
  }

  /**
   * Assert that a file exists in the tree and is fully committed — i.e.
   * its status is "committed" or "just-committed", NOT any of the
   * uncommitted states (uncommitted-new, uncommitted-modified, removed).
   * Use this when the test cares that the file should have been
   * committed by the app but wasn't.
   */
  async expectFileCommitted(path: string): Promise<void> {
    const entry = this.fileEntry(path);
    await this.expect(
      entry,
      `file "${path}" should be present in the MeadowHome files tree at the current tick`,
    ).toBeVisible();
    const status = await entry.getAttribute("data-file-status");
    const committed = status === "committed" || status === "just-committed";
    this.expect(
      committed,
      `file "${path}" should be committed at the current tick, but actual data-file-status is "${status}"`,
    ).toBe(true);
  }

  /**
   * Assert that a file is present AND marked as gitignored (so the
   * report viewer renders it greyed-out). Use this for per-instance
   * config files like app/secret_app_config.yaml that legitimately
   * exist on disk but should never be tracked by git.
   */
  async expectFileIgnored(path: string): Promise<void> {
    const entry = this.fileEntry(path);
    await this.expect(
      entry,
      `file "${path}" should be present in the MeadowHome files tree at the current tick`,
    ).toBeVisible();
    const ignored = await entry.getAttribute("data-file-ignored");
    this.expect(
      ignored,
      `file "${path}" should be marked as gitignored (data-file-ignored="true") so the UI renders it greyed-out, but actual data-file-ignored is "${ignored}"`,
    ).toBe("true");
  }

  /**
   * Assert that a file is NOT present in the tree at the current tick.
   * Use this when the test cares that the file should not exist yet (or
   * should have been removed). Note: a file with status "removed" still
   * renders as a tree entry, so this helper fails in that case too,
   * which is usually what you want.
   */
  async expectFileNotPresent(path: string): Promise<void> {
    await this.expect(
      this.fileEntry(path),
      `file "${path}" should NOT be present in the MeadowHome files tree at the current tick`,
    ).toHaveCount(0);
  }

  /**
   * Return the `data-file-status` value for a path, or null if the file
   * isn't in the tree at the current tick.
   */
  async getFileStatus(path: string): Promise<string | null> {
    const entry = this.fileEntry(path);
    if ((await entry.count()) === 0) return null;
    return entry.getAttribute("data-file-status");
  }
}
