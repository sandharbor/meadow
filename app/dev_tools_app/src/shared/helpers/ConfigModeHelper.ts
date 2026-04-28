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

import { ConfigMode } from "../types.js";

/**
 * Helper class that determines and provides information about the current config mode.
 *
 * Config modes:
 * - Normal: no backup exists, using real config
 * - MissingConf: backup exists but config dir doesn't (simulates fresh install)
 * - TestFixture: backup exists and config dir exists (a test fixture is set up)
 */
export class ConfigModeHelper {
  public readonly mode: ConfigMode;

  constructor(backupExists: boolean, configDirExists: boolean) {
    if (!backupExists) {
      this.mode = ConfigMode.Normal;
    } else {
      this.mode = configDirExists ? ConfigMode.TestFixture : ConfigMode.MissingConf;
    }
  }

  static fromMode(mode: ConfigMode): ConfigModeHelper {
    switch (mode) {
      case ConfigMode.Normal:
        return new ConfigModeHelper(false, false);
      case ConfigMode.MissingConf:
        return new ConfigModeHelper(true, false);
      case ConfigMode.TestFixture:
        return new ConfigModeHelper(true, true);
    }
  }

  get isNormal(): boolean {
    return this.mode === ConfigMode.Normal;
  }

  get isMissingConf(): boolean {
    return this.mode === ConfigMode.MissingConf;
  }

  get isTestFixture(): boolean {
    return this.mode === ConfigMode.TestFixture;
  }

  get isTestMode(): boolean {
    return this.mode !== ConfigMode.Normal;
  }
}
