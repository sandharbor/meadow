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
 * Utility for reading a site-local publishing-provider `pp_config.yaml`.
 *
 * Lives at:
 *   <configDir>/sites/<siteSlug>/config/publishing_providers/<providerId>/pp_config.yaml
 *
 * Returns the parsed object so tests can assert on provider-specific fields
 * (e.g. publishSlug, publishPrefix) directly.
 */
export class MeadowHomePublishingProviderConfig {
  constructor(
    private configDir: string,
    private providerId: string,
    private siteSlug: string,
    private expect: Expect,
  ) {}

  private ppConfigPath(): string {
    return path.join(
      this.configDir,
      "sites",
      this.siteSlug,
      "config",
      "publishing_providers",
      this.providerId,
      "pp_config.yaml",
    );
  }

  /** Parse and return the site-local pp_config.yaml. Fails if absent or invalid. */
  read(): Record<string, unknown> {
    const filePath = this.ppConfigPath();
    this.expect(
      fs.existsSync(filePath),
      `Expected pp_config.yaml at ${filePath}`,
    ).toBe(true);
    const parsed = YAML.parse(fs.readFileSync(filePath, "utf8")) as
      | Record<string, unknown>
      | null;
    return parsed ?? {};
  }
}
