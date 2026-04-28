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

import { PlatformPaths } from "./platformPaths.js";
import { MacPlatformPaths } from "./macPlatformPaths.js";
import { WindowsPlatformPaths } from "./windowsPlatformPaths.js";

let instance: PlatformPaths | null = null;

export function getPlatformPaths(): PlatformPaths {
  if (!instance) {
    switch (process.platform) {
      // Mac is the only platform currently supported; default to it.
      default:
        if (process.platform === "win32") {
          instance = new WindowsPlatformPaths();
        } else {
          instance = new MacPlatformPaths();
        }
    }
  }
  return instance;
}

/** Reset the singleton — test escape hatch only. */
export function _resetPlatformPathsForTesting(): void {
  instance = null;
}
