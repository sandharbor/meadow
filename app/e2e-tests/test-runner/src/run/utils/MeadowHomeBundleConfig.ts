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
 * Utility for reading a bundle's `bundle_config.yaml` inside a MeadowHome.
 *
 * Lives at `<configDir>/bundles/<bundleSlug>/config/bundle_config.yaml`. Returns the
 * parsed object so tests can assert on fields directly.
 */
export class MeadowHomeBundleConfig {
  constructor(
    private configDir: string,
    private bundleSlug: string,
    private expect: Expect,
  ) {}

  private bundleConfigPath(): string {
    return path.join(this.configDir, "bundles", this.bundleSlug, "config", "bundle_config.yaml");
  }

  /** Parse and return the bundle_config.yaml. Fails the test if absent or invalid. */
  read(): Record<string, unknown> {
    const filePath = this.bundleConfigPath();
    this.expect(
      fs.existsSync(filePath),
      `Expected bundle_config.yaml at ${filePath}`,
    ).toBe(true);
    const parsed = YAML.parse(fs.readFileSync(filePath, "utf8")) as
      | Record<string, unknown>
      | null;
    return parsed ?? {};
  }
}
