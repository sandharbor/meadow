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

import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.js";

// Playwright config that runs only tests outside tests/meadow-extension/.
// Used to verify the base suite stays green independently of any optional
// extension layer. The shared playwright.config.ts only starts extension
// backing services when the extension's global_setup.ts is mounted in,
// so this config also verifies the framework boots cleanly without them.
export default defineConfig({
  ...baseConfig,
  testIgnore: "meadow-extension/**",
});
