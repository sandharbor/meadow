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
import { createLocalRuntimeSession } from "../../../../../shared_code/utils/localRuntimeSession.js";

async function main(): Promise<void> {
  const configDirectory = process.argv[2];
  if (!configDirectory) {
    throw new Error("Usage: create_local_runtime_session.ts <MeadowHome>");
  }
  const { session, sessionPath } = await createLocalRuntimeSession({
    homeDirectory: path.resolve(configDirectory),
    ownerPid: 0,
  });
  process.stdout.write([
    sessionPath,
    String(session.backendPort),
    String(session.frontendPort),
  ].join("\t"));
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
