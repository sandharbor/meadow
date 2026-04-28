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

import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { findRandomPort } from "../../../shared_code/utils/portUtils.js";
import {
  ensureResourcesConfigInitialized,
  saveResourcesLocalConfig,
} from "../../../shared_code/utils/resourcesConfigUtils.js";

async function main() {
  const uniqueId = crypto.randomBytes(8).toString("hex");
  const baseDir = path.join(os.tmpdir(), "meadow_parallel", uniqueId);
  const logsDir = path.join(baseDir, "logs");

  fs.mkdirSync(logsDir, { recursive: true });
  process.stderr.write(`Created parallel instance directory: ${baseDir}\n`);

  // Initialize resources.yaml with defaults
  ensureResourcesConfigInitialized(baseDir);
  process.stderr.write("Initialized resources.yaml with defaults\n");

  // Allocate free ports
  const backendPort = await findRandomPort();
  const frontendPort = await findRandomPort();
  const devToolsPort = await findRandomPort();
  const devToolsServerPort = await findRandomPort();
  process.stderr.write(
    `Allocated ports: backend=${backendPort}, frontend=${frontendPort}, devTools=${devToolsPort}, devToolsServer=${devToolsServerPort}\n`
  );

  // Write local overrides with ports and log directory
  saveResourcesLocalConfig(
    { backendPort, frontendPort, devToolsPort, devToolsServerPort, logDirectory: logsDir },
    baseDir
  );
  process.stderr.write("Wrote resources.local.yaml with ports and log directory\n");

  // Print the config directory path to stdout for capture
  process.stdout.write(baseDir);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err}\n`);
  process.exit(1);
});
