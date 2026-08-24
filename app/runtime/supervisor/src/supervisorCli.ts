#!/usr/bin/env node
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

import { rmSync } from "node:fs";
import { readRuntimeSupervisorLaunchSpec } from "./launchSpec.js";
import { RuntimeSupervisor } from "./runtimeSupervisor.js";

function parseSpecPath(args: string[]): string {
  const index = args.indexOf("--launch-spec");
  const specPath = index >= 0 ? args[index + 1] : undefined;
  if (!specPath) throw new Error("Usage: meadow-runtime-supervisor --launch-spec <path>");
  return specPath;
}

async function main(): Promise<void> {
  const specPath = parseSpecPath(process.argv.slice(2));
  const spec = readRuntimeSupervisorLaunchSpec(specPath);
  rmSync(specPath, { force: true });
  let resolveExit: (() => void) | null = null;
  const completed = new Promise<void>(resolve => { resolveExit = resolve; });
  const supervisor = new RuntimeSupervisor(spec, { onExit: () => resolveExit?.() });
  process.once("SIGINT", () => void supervisor.shutdown("signal"));
  process.once("SIGTERM", () => void supervisor.shutdown("signal"));
  await supervisor.start();
  await completed;
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
