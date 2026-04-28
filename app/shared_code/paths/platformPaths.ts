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

import { existsSync, readFileSync } from "fs";
import YAML from "yaml";
import { BootstrapConfig } from "../types/bootstrapConfig.js";

/**
 * Abstract base class for platform-specific path defaults.
 * Subclass per OS; use getPlatformPaths() to obtain the singleton.
 */
export abstract class PlatformPaths {
  /** Platform default for the meadow home directory. */
  abstract get defaultConfigDirectory(): string;

  /** Platform default for the bootstrap config file. */
  abstract get bootstrapConfigPath(): string;

  protected get homedir(): string {
    return process.env.HOME || process.env.USERPROFILE || "";
  }

  /**
   * Loads bootstrap config from the platform-specific path.
   * Returns empty object if file doesn't exist.
   */
  loadBootstrapConfig(): BootstrapConfig {
    const path = this.bootstrapConfigPath;
    if (!existsSync(path)) {
      return {};
    }
    try {
      const content = readFileSync(path, "utf8");
      return (YAML.parse(content) as BootstrapConfig) || {};
    } catch (error) {
      console.warn("Error loading bootstrap config:", error);
      return {};
    }
  }

  /**
   * Gets the meadow home directory path.
   * Priority (highest to lowest):
   * 1. MEADOW_HOME_DIRECTORY_OVERRIDE environment variable
   * 2. meadowHomeDirectoryOverride in bootstrap config
   * 3. Platform default
   */
  getConfigDirectory(): string {
    const envOverride = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
    if (envOverride) {
      return envOverride;
    }

    const bootstrapConfig = this.loadBootstrapConfig();
    if (bootstrapConfig.meadowHomeDirectoryOverride) {
      return bootstrapConfig.meadowHomeDirectoryOverride;
    }

    return this.defaultConfigDirectory;
  }
}
