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

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  assembleCommandDistribution,
  readVerifiedPayloadManifest,
} from "./qaDistributions.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const meadowRoot = path.resolve(scriptDirectory, "../../../..");
const cliRoot = path.join(meadowRoot, "app/clients/cli");

function defaultRunCommand(command, args, cwd, environment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Command artifact build failed: ${command} ${args.join(" ")}`);
  }
}

export function buildCommandArtifact({
  payloadRoot,
  commandRoot,
  commandArchive = `${commandRoot}.zip`,
  status = "local-qa",
  platform,
  arch,
  cliBundle = path.join(cliRoot, "dist/meadow.cjs"),
  cliLauncher = path.join(cliRoot, "bin/meadow"),
  runCommand = defaultRunCommand,
}) {
  const manifest = readVerifiedPayloadManifest(payloadRoot);
  runCommand(
    "npm",
    ["run", "build"],
    cliRoot,
    { MEADOW_BUILD_PERSPECTIVE: manifest.perspective },
  );
  const metadata = assembleCommandDistribution({
    payloadRoot,
    cliBundle,
    cliLauncher,
    commandRoot,
    status,
    platform,
    arch,
  });
  runCommand(
    "/usr/bin/ditto",
    ["-c", "-k", "--keepParent", commandRoot, commandArchive],
    path.dirname(commandArchive),
  );
  return {
    metadata,
    commandRoot,
    commandArchive,
  };
}
