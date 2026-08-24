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

  /** All stable logical migration IDs recorded as completed, in ledger order. */
  listCompleted(): string[] {
    const filePath = this.migrationsPath();
    if (!fs.existsSync(filePath)) return [];
    const parsed = YAML.parse(fs.readFileSync(filePath, "utf8")) as
      | { completedMigrations?: unknown; completed_migrations?: unknown }
      | null;
    if (parsed && Array.isArray(parsed.completedMigrations)) {
      return parsed.completedMigrations.flatMap((entry) => (
        typeof entry === "object"
          && entry !== null
          && "id" in entry
          && typeof entry.id === "string"
          ? [entry.id]
          : []
      ));
    }
    // Reading the legacy shape remains useful while a before-fixture is still
    // waiting for the production runner to canonicalize it.
    if (parsed && Array.isArray(parsed.completed_migrations)) {
      return parsed.completed_migrations.filter(
        (entry): entry is string => typeof entry === "string",
      ).map(entry => entry.replace(/\.(?:ts|js)$/, ""));
    }
    return [];
  }

  /**
   * Assert that the stable logical migration `id` is present in
   * `migrations.yaml`. Polls for a short window so tests that run
   * shortly after backend startup don't race the migration runner.
   */
  async expectCompleted(id: string, timeoutMs = 10_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const completed = this.listCompleted();
      if (completed.includes(id)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    this.expect(
      this.listCompleted(),
      `Expected migration "${id}" in migrations.yaml after ${timeoutMs}ms`,
    ).toContain(id);
  }

  /** Assert that `id` is NOT listed as completed (pending / never ran). */
  expectNotCompleted(id: string): void {
    this.expect(
      this.listCompleted(),
      `Expected migration "${id}" to be absent from migrations.yaml`,
    ).not.toContain(id);
  }
}
