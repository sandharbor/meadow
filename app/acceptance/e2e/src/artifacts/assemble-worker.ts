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

// Worker script for parallel test artifact assembly.
// Invoked via child_process.fork() from assembleRun().
import { assembleTestArtifacts } from "./assemble.ts";

const testDir = process.argv[2];
if (!testDir) {
  console.error("assemble-worker: missing testDir argument");
  process.exit(1);
}

try {
  assembleTestArtifacts(testDir);
  process.exit(0);
} catch (err) {
  console.error(`assemble-worker: ${testDir}: ${err}`);
  process.exit(1);
}
