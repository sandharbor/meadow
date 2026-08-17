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

import type { Expect, Page } from "@playwright/test";

export interface GeneratedBundleVersionSummary {
  versionId: string;
  displayState: string;
  savedGenerationId: string | null;
  notes: string;
}

/**
 * Read-only access to the generated-version review API for E2E assertions.
 *
 * Tests should describe the lifecycle state they expect, without repeating
 * endpoint construction, response parsing, or readiness polling.
 */
export class GeneratedBundleVersions {
  private readonly endpoint: string;

  constructor(
    private readonly page: Page,
    private readonly expect: Expect,
    bundleSlug: string,
  ) {
    this.endpoint = `/api/bundles/${encodeURIComponent(bundleSlug)}/review/versions`;
  }

  private async tryList(): Promise<GeneratedBundleVersionSummary[] | null> {
    const response = await this.page.request.get(this.endpoint);
    if (!response.ok()) return null;

    const body = await response.json() as { versions?: unknown };
    return Array.isArray(body.versions)
      ? body.versions as GeneratedBundleVersionSummary[]
      : null;
  }

  async list(): Promise<GeneratedBundleVersionSummary[]> {
    const versions = await this.tryList();
    this.expect(versions, `Expected a valid generated-version response from ${this.endpoint}`).not.toBeNull();
    return versions!;
  }

  async waitForCount(count: number, timeout = 60_000): Promise<GeneratedBundleVersionSummary[]> {
    await this.expect.poll(
      async () => (await this.tryList())?.length ?? -1,
      { timeout },
    ).toBe(count);
    return this.list();
  }

  async waitForOnlyVersion(timeout = 60_000): Promise<GeneratedBundleVersionSummary> {
    const [version] = await this.waitForCount(1, timeout);
    return version;
  }
}
