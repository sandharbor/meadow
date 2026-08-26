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
import {
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPayloadManifest,
  verifyPayloadManifest,
} from "./buildRuntimePayload.mjs";
import { RUNTIME_PAYLOAD_EXECUTABLE_PATHS } from "./runtimePayloadDefinition.mjs";

const PAYLOAD_MARKER = ".meadow-runtime-payload";
const PAYLOAD_MANIFEST = "manifest.json";

function defaultRunCommand(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function requirePayloadRoot(payloadRoot) {
  if (typeof payloadRoot !== "string" || payloadRoot.length === 0) {
    throw new Error("--payload-root is required");
  }
  const resolved = path.resolve(payloadRoot);
  if (!existsSync(path.join(resolved, PAYLOAD_MARKER))) {
    throw new Error(`Runtime Payload marker is missing: ${resolved}`);
  }
  return resolved;
}

function readManifest(payloadRoot) {
  const manifestPath = path.join(payloadRoot, PAYLOAD_MANIFEST);
  if (!existsSync(manifestPath)) {
    throw new Error(`Runtime Payload manifest is missing: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    typeof manifest.appVersion !== "string"
    || manifest.appVersion.length === 0
    || (manifest.perspective !== "standalone" && manifest.perspective !== "composed")
  ) {
    throw new Error(`Runtime Payload manifest metadata is invalid: ${manifestPath}`);
  }
  return manifest;
}

function requirePayloadExecutables(payloadRoot) {
  return RUNTIME_PAYLOAD_EXECUTABLE_PATHS.map(relativePath => {
    const executable = path.join(payloadRoot, relativePath);
    if (!existsSync(executable)) {
      throw new Error(`Runtime Payload executable is missing: ${executable}`);
    }
    return { relativePath, executable };
  });
}

export function signRuntimePayload({
  payloadRoot,
  identity,
  entitlementsPath,
  runCommand = defaultRunCommand,
}) {
  if (!identity) throw new Error("A macOS code-signing identity is required");
  const resolvedPayloadRoot = requirePayloadRoot(payloadRoot);
  const existingManifest = readManifest(resolvedPayloadRoot);
  const executables = requirePayloadExecutables(resolvedPayloadRoot);
  if (!verifyPayloadManifest(resolvedPayloadRoot, existingManifest)) {
    throw new Error(`Runtime Payload manifest verification failed before signing: ${resolvedPayloadRoot}`);
  }
  const resolvedEntitlements = entitlementsPath ? path.resolve(entitlementsPath) : null;
  if (resolvedEntitlements && !existsSync(resolvedEntitlements)) {
    throw new Error(`Runtime Payload entitlements are missing: ${resolvedEntitlements}`);
  }

  for (const { executable } of executables) {
    const args = ["--force", "--options", "runtime", "--timestamp"];
    if (resolvedEntitlements) args.push("--entitlements", resolvedEntitlements);
    args.push("--sign", identity, executable);
    runCommand("/usr/bin/codesign", args);
  }

  const manifest = createPayloadManifest(resolvedPayloadRoot, {
    appVersion: existingManifest.appVersion,
    perspective: existingManifest.perspective,
  });
  writeFileSync(
    path.join(resolvedPayloadRoot, PAYLOAD_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  if (!verifyPayloadManifest(resolvedPayloadRoot, manifest)) {
    throw new Error("Signed Runtime Payload manifest failed self-verification");
  }
  return manifest;
}

export function verifySignedRuntimePayload({
  payloadRoot,
  runCommand = defaultRunCommand,
}) {
  const resolvedPayloadRoot = requirePayloadRoot(payloadRoot);
  const manifest = readManifest(resolvedPayloadRoot);
  if (!verifyPayloadManifest(resolvedPayloadRoot, manifest)) {
    throw new Error(`Runtime Payload manifest verification failed: ${resolvedPayloadRoot}`);
  }
  for (const { executable } of requirePayloadExecutables(resolvedPayloadRoot)) {
    runCommand("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", executable]);
  }
  return manifest;
}

function value(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function printHelp() {
  process.stdout.write(`Usage:
  node src/signRuntimePayload.mjs sign --payload-root <directory> --identity <developer-id> [--entitlements <file>]
  node src/signRuntimePayload.mjs verify --payload-root <directory>
  node src/signRuntimePayload.mjs list
`);
}

if (
  process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    const args = process.argv.slice(2);
    const command = args[0];
    if (command === "list") {
      process.stdout.write(`${RUNTIME_PAYLOAD_EXECUTABLE_PATHS.join("\n")}\n`);
    } else if (command === "sign") {
      const manifest = signRuntimePayload({
        payloadRoot: value(args, "--payload-root"),
        identity: value(args, "--identity"),
        entitlementsPath: value(args, "--entitlements"),
      });
      process.stdout.write(`${JSON.stringify({ identity: manifest.identity })}\n`);
    } else if (command === "verify") {
      const manifest = verifySignedRuntimePayload({ payloadRoot: value(args, "--payload-root") });
      process.stdout.write(`${JSON.stringify({ identity: manifest.identity })}\n`);
    } else if (command === "--help" || command === undefined) {
      printHelp();
    } else {
      throw new Error(`Unknown Runtime Payload signing command: ${command}`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
