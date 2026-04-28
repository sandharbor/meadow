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

import fs from "fs";
import path from "path";
import YAML from "yaml";
import type { Expect } from "@playwright/test";

/**
 * Utility for asserting and inspecting the migration bookkeeping inside a
 * MeadowHome directory.
 *
 * The migration runner maintains one ledger per scope: core writes to
 * `<configDir>/migrations.yaml`, and each publishing provider that ships
 * its own migrations writes to
 * `<configDir>/app/publishing_providers/<providerId>/migrations.yaml`.
 *
 * Construct with no scope to read the core ledger, or pass `{ providerId }`
 * to read a specific provider's ledger.
 */
export class MeadowHomeMigrations {
  private providerId?: string;

  constructor(configDir: string, expect: Expect, options?: { providerId?: string });
  constructor(configDir: string, expect: Expect);
  constructor(
    private configDir: string,
    private expect: Expect,
    options?: { providerId?: string },
  ) {
    this.providerId = options?.providerId;
  }

  private migrationsPath(): string {
    if (this.providerId) {
      return path.join(
        this.configDir,
        "app",
        "publishing_providers",
        this.providerId,
        "migrations.yaml",
      );
    }
    return path.join(this.configDir, "migrations.yaml");
  }

  /** All migration filenames recorded as completed, in the order the file lists them. */
  listCompleted(): string[] {
    const filePath = this.migrationsPath();
    if (!fs.existsSync(filePath)) return [];
    try {
      const parsed = YAML.parse(fs.readFileSync(filePath, "utf8")) as
        | { completed_migrations?: unknown }
        | null;
      if (parsed && Array.isArray(parsed.completed_migrations)) {
        return parsed.completed_migrations.filter(
          (entry): entry is string => typeof entry === "string",
        );
      }
    } catch {
      // fall through — treat a corrupt/unreadable file as empty
    }
    return [];
  }

  /**
   * Assert that the migration identified by `filename` (e.g.
   * `26_04_22_10_00_00_u6sotb1nmvag_move_meadow_to_provider.ts`) is present
   * in `migrations.yaml`. Polls for a short window so tests that run
   * shortly after backend startup don't race the migration runner.
   */
  async expectCompleted(filename: string, timeoutMs = 10_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const completed = this.listCompleted();
      if (completed.includes(filename)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    this.expect(
      this.listCompleted(),
      `Expected migration "${filename}" in migrations.yaml after ${timeoutMs}ms`,
    ).toContain(filename);
  }

  /** Assert that `filename` is NOT listed as completed (pending / never ran). */
  expectNotCompleted(filename: string): void {
    this.expect(
      this.listCompleted(),
      `Expected migration "${filename}" to be absent from migrations.yaml`,
    ).not.toContain(filename);
  }
}
