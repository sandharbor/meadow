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
 * Navigates the ScenarioViewer to a specific tick. The header tick
 * dropdown is tab-agnostic, so this works regardless of which tab
 * (Files, structured-state, S3, Test Code) is currently active.
 *
 * Note: the header dropdown only lists "interesting" ticks (ones with
 * file / state-repo / s3 changes or snapshot markers). Trying to
 * navigate to an uninteresting tick via this component will fail with
 * a clear error. That's intentional — if a test cares about an
 * uninteresting tick, the test is probably looking at the wrong layer.
 */
export class TickNavComponent {
  constructor(
    private page: Page,
    private expect: Expect,
  ) {}

  private get headerTickButton() {
    // The header button whose label starts with "Tick" — either
    // "Tick: --" (initial state) or "Tick N/total:" (after selection).
    return this.page.getByRole("button", { name: /^Tick/ });
  }

  private dropdownItemFor(tickNumber: number) {
    // 1-indexed tick number (matches what the user sees as "tick 2").
    return this.page.locator(`button[data-tick-index="${tickNumber - 1}"]`);
  }

  /**
   * Open the dropdown and click the entry for the given 1-indexed tick.
   * Verifies the header label updates to "Tick N/total:" before returning.
   */
  async goToTick(tickNumber: number): Promise<void> {
    await this.headerTickButton.click();
    const item = this.dropdownItemFor(tickNumber);
    await this.expect(
      item,
      `tick ${tickNumber} should be present in the header dropdown (the dropdown only lists ticks that have changes — check the manifest if you expected it to be there)`,
    ).toBeVisible();
    await item.click();
    await this.expect(
      this.page.getByText(new RegExp(`^Tick ${tickNumber}/\\d+:`)),
    ).toBeVisible();
  }
}
