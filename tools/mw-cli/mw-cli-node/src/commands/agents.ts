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

import { join } from "node:path";
import { existsSync } from "node:fs";
import { runInteractive } from "../lib/exec.js";

export function agents(): void {
  // Resolve path to agents-manager entry point
  const agentsManagerDir = join(import.meta.dirname, "..", "..", "..", "..", "..", "_agent", "manager", "agents-manager-node");
  const tsxBin = join(agentsManagerDir, "node_modules", ".bin", "tsx");
  const entryPoint = join(agentsManagerDir, "src", "agentsManager.ts");

  if (!existsSync(tsxBin)) {
    console.error(`agents-manager dependencies not installed.\nRun: _agent/manager/_module/scripts/prepare`);
    process.exit(1);
  }

  const code = runInteractive(tsxBin, [entryPoint]);
  if (code !== 0) {
    process.exit(code);
  }
}
