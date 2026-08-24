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

import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

export interface RuntimePaths {
  directory: string;
  ownershipLock: string;
  sessionDescriptor: string;
  startupDiagnostic: string;
}

export function runtimeHomeId(homeDirectory: string): string {
  return createHash("sha256")
    .update(path.resolve(homeDirectory))
    .digest("hex")
    .slice(0, 24);
}

export function getRuntimePaths(
  homeDirectory: string,
  runtimeRoot = path.join(tmpdir(), "meadow-runtime"),
): RuntimePaths {
  const directory = path.join(runtimeRoot, runtimeHomeId(homeDirectory));
  return {
    directory,
    ownershipLock: path.join(directory, "home-ownership.lock"),
    sessionDescriptor: path.join(directory, "session.json"),
    startupDiagnostic: path.join(directory, "startup-failure.json"),
  };
}
