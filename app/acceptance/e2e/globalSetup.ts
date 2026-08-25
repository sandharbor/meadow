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

import type { FullConfig } from "@playwright/test";
import { setupSharedServices } from "./src/run/scripts/shared_services.js";

export default function globalSetup(config: FullConfig): void {
  setupSharedServices({
    e2eDir: import.meta.dirname,
    workerCount: config.workers,
  });
}
