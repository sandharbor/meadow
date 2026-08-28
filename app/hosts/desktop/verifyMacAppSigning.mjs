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

import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_JIT_ENTITLEMENTS = [
  "com.apple.security.cs.allow-jit",
  "com.apple.security.cs.allow-unsigned-executable-memory",
  "com.apple.security.cs.disable-library-validation",
];

const ELECTRON_HELPERS = [
  "Meadow Helper.app",
  "Meadow Helper (GPU).app",
  "Meadow Helper (Plugin).app",
  "Meadow Helper (Renderer).app",
];

function readEntitlements(codePath) {
  const xml = execFileSync(
    "/usr/bin/codesign",
    ["-d", "--entitlements", ":-", codePath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(execFileSync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", "-"],
    { encoding: "utf8", input: xml },
  ));
}

function requireEntitlements(codePath, requiredEntitlements) {
  const entitlements = readEntitlements(codePath);
  const missing = requiredEntitlements.filter(key => entitlements[key] !== true);
  if (missing.length > 0) {
    throw new Error(
      `${codePath} is missing required entitlement(s): ${missing.join(", ")}`,
    );
  }
}

export function verifyMacAppSigning(appBundle) {
  const resolvedAppBundle = path.resolve(appBundle);
  if (!existsSync(resolvedAppBundle)) {
    throw new Error(`Meadow app bundle was not found: ${resolvedAppBundle}`);
  }

  execFileSync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", resolvedAppBundle],
    { stdio: "inherit" },
  );
  requireEntitlements(resolvedAppBundle, REQUIRED_JIT_ENTITLEMENTS);

  const frameworks = path.join(resolvedAppBundle, "Contents", "Frameworks");
  for (const helperName of ELECTRON_HELPERS) {
    const helper = path.join(frameworks, helperName);
    if (!existsSync(helper)) {
      throw new Error(`Required Electron helper was not found: ${helper}`);
    }
    requireEntitlements(helper, REQUIRED_JIT_ENTITLEMENTS);
  }

  process.stdout.write("Meadow app signature and Electron helper entitlements verified.\n");
}

if (
  process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    if (!process.argv[2]) {
      throw new Error("Usage: verifyMacAppSigning.mjs <Meadow.app>");
    }
    verifyMacAppSigning(process.argv[2]);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
