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

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export default function globalTeardown() {
  // Stop MinIO container if it was started
  const minioContainerFile = path.join(import.meta.dirname, ".minio-container");
  if (fs.existsSync(minioContainerFile)) {
    const containerName = fs.readFileSync(minioContainerFile, "utf8").trim();
    if (containerName) {
      try {
        execSync(`docker stop ${containerName}`, { stdio: "ignore" });
      } catch {
        // Container may already be stopped
      }
    }
    fs.unlinkSync(minioContainerFile);
  }

  // Run the extension's global teardown, if an extension layer is mounted.
  const extTeardownScript = path.join(
    import.meta.dirname, "src/run/meadow-extension/scripts/global_teardown.ts"
  );
  if (fs.existsSync(extTeardownScript)) {
    try {
      execSync(`npx tsx ${extTeardownScript}`, {
        cwd: import.meta.dirname,
        stdio: "inherit",
      });
    } catch {
      // teardown failures shouldn't block the rest of the run
    }
  }
}
