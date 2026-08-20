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

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CodexOperatorAdapter } from "./adapters/CodexOperatorAdapter.js";
import { StandaloneTrialRuntime } from "./runtime/StandaloneTrialRuntime.js";
import { CREATE_SAFE_BUNDLE_SCENARIO } from "./scenarios/createSafeBundle.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const CLI_DIR = path.join(REPO_ROOT, "app", "cli");

async function main(): Promise<void> {
  execFileSync("npm", ["run", "build"], { cwd: CLI_DIR, stdio: "inherit" });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactDirectory = path.join(
    process.env.MEADOW_AGENT_EVAL_ARTIFACTS
      ?? path.join(os.homedir(), "meadow-agent-eval-artifacts", "isolation"),
    timestamp,
  );
  mkdirSync(artifactDirectory, { recursive: true });
  const runtime = new StandaloneTrialRuntime({ artifactDirectory });
  const operator = new CodexOperatorAdapter(
    CREATE_SAFE_BUNDLE_SCENARIO.profiles.operator,
    () => runtime.operatorLaunchContext(),
    {
      timeoutMs: CREATE_SAFE_BUNDLE_SCENARIO.limits.durationMs,
      idleMs: CREATE_SAFE_BUNDLE_SCENARIO.limits.idleMs,
    },
  );
  try {
    await runtime.start();
    await operator.verifyIsolationOnly();
    process.stdout.write(`Operator isolation passed. Evidence: ${path.join(artifactDirectory, "operator-isolation.json")}\n`);
  } finally {
    await Promise.allSettled([operator.stop(), runtime.stop()]);
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
