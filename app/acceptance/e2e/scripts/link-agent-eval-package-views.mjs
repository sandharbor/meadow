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

import { lstatSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageViews = [
  {
    link: path.join(packageRoot, "src", "agent-evals"),
    target: "../../agent_evals/src",
  },
  {
    link: path.join(packageRoot, "tests", "agent-eval-harness.test.ts"),
    target: "../../agent_evals/test/harness.test.ts",
  },
];

for (const view of packageViews) {
  try {
    const stat = lstatSync(view.link);
    if (stat.isSymbolicLink() && readlinkSync(view.link) === view.target) {
      continue;
    }
    if (!stat.isSymbolicLink()) {
      throw new Error(`Refusing to replace non-symlink agent-eval package view: ${view.link}`);
    }
    rmSync(view.link);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
  symlinkSync(view.target, view.link);
}
