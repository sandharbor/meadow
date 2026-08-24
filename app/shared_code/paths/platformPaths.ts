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

import { BootstrapConfig } from "../../contracts/types/bootstrapConfig.js";
import { bootstrapConfigCodec } from "../utils/configDocumentCodecs.js";
import { readDurableDocument, requireValidDocument } from "../utils/durableDocument.js";

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
    return requireValidDocument(
      readDurableDocument(this.bootstrapConfigPath, bootstrapConfigCodec),
      () => ({}),
    );
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
