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

import { existsSync, renameSync, rmSync } from "node:fs";

export interface ActivateNormalConfigOptions {
  configDirectory: string;
  normalConfigBackup: string;
  activeFixtureFile: string;
}

export type ActivateNormalConfigResult = "already-normal" | "restored-backup";

/**
 * Makes the normal Meadow Home active. No backup is the durable signal that
 * Dev Tools is already in Normal mode, so that case is a successful no-op.
 */
export function activateNormalConfig(
  options: ActivateNormalConfigOptions,
): ActivateNormalConfigResult {
  if (!existsSync(options.normalConfigBackup)) {
    if (existsSync(options.activeFixtureFile)) rmSync(options.activeFixtureFile);
    return "already-normal";
  }

  if (existsSync(options.configDirectory)) {
    rmSync(options.configDirectory, { recursive: true });
  }
  renameSync(options.normalConfigBackup, options.configDirectory);
  if (existsSync(options.activeFixtureFile)) rmSync(options.activeFixtureFile);
  return "restored-backup";
}
