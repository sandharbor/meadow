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
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { verifyPayloadManifest } from "./buildRuntimePayload.mjs";

export const QA_DISTRIBUTION_MARKER = ".meadow-qa-distributions";
export const COMMAND_DISTRIBUTION_MARKER = ".meadow-command-distribution";
export const CRITICAL_PAYLOAD_FILES = [
  "bin/node",
  "native/fast_git_ops_bin",
  "native/source_page_search_by_title_bin",
  "native/working_graph_bin",
  "service/dist/runtime/service/src/shared/app-shell/index.js",
  "supervisor/meadow-runtime-supervisor.cjs",
  "web/index.html",
  "web/server.js",
];

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function readVerifiedPayloadManifest(payloadRoot) {
  const manifestPath = path.join(payloadRoot, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Runtime Payload manifest is missing: ${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  if (!verifyPayloadManifest(payloadRoot, manifest)) {
    throw new Error(`Runtime Payload manifest verification failed: ${payloadRoot}`);
  }
  return manifest;
}

export function assembleCommandDistribution({
  payloadRoot,
  cliBundle,
  cliLauncher,
  commandRoot,
}) {
  const manifest = readVerifiedPayloadManifest(payloadRoot);
  mkdirSync(path.join(commandRoot, "bin"), { recursive: true });
  cpSync(payloadRoot, path.join(commandRoot, "runtime-payload"), {
    recursive: true,
    force: true,
    preserveTimestamps: true,
  });
  cpSync(cliBundle, path.join(commandRoot, "bin/meadow.cjs"), { force: true });
  cpSync(cliLauncher, path.join(commandRoot, "bin/meadow"), { force: true });
  chmodSync(path.join(commandRoot, "bin/meadow"), 0o755);
  writeFileSync(path.join(commandRoot, COMMAND_DISTRIBUTION_MARKER), "Meadow Command QA Distribution\n");
  const metadata = {
    schemaVersion: 1,
    status: "local-qa",
    perspective: manifest.perspective,
    appVersion: manifest.appVersion,
    payloadIdentity: manifest.identity,
    entrypoint: "bin/meadow",
  };
  writeFileSync(path.join(commandRoot, "artifact.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

function manifestFileMap(manifest) {
  return new Map(manifest.files.map(file => [file.path, file]));
}

export function createPayloadParityReport({
  perspective,
  desktopPayloadRoot,
  commandPayloadRoot,
  criticalFiles = CRITICAL_PAYLOAD_FILES,
}) {
  const desktop = readVerifiedPayloadManifest(desktopPayloadRoot);
  const command = readVerifiedPayloadManifest(commandPayloadRoot);
  const desktopFiles = manifestFileMap(desktop);
  const commandFiles = manifestFileMap(command);
  const criticalFileChecks = criticalFiles.map(file => {
    const desktopFile = desktopFiles.get(file);
    const commandFile = commandFiles.get(file);
    return {
      file,
      desktopSha256: desktopFile?.sha256 ?? null,
      commandSha256: commandFile?.sha256 ?? null,
      match: Boolean(desktopFile && commandFile && desktopFile.sha256 === commandFile.sha256),
    };
  });
  const identityMatch = desktop.identity === command.identity;
  const perspectiveMatch = desktop.perspective === perspective && command.perspective === perspective;
  return {
    schemaVersion: 1,
    result: identityMatch && perspectiveMatch && criticalFileChecks.every(check => check.match)
      ? "pass"
      : "fail",
    perspective,
    desktopPayloadIdentity: desktop.identity,
    commandPayloadIdentity: command.identity,
    identityMatch,
    perspectiveMatch,
    criticalFileChecks,
  };
}

export function createArtifactInventory({
  perspective,
  nodeExecutable,
  nodeVersion,
  commandRoot,
  commandArchive,
  desktopApp,
  parityReport,
}) {
  const nodeContents = readFileSync(nodeExecutable);
  return {
    schemaVersion: 1,
    status: "local-qa",
    perspective,
    node: {
      version: nodeVersion,
      sha256: sha256(nodeContents),
      bytes: nodeContents.byteLength,
    },
    command: {
      directory: path.basename(commandRoot),
      archive: path.basename(commandArchive),
    },
    desktop: desktopApp ? { application: path.basename(desktopApp) } : null,
    payloadIdentity: parityReport
      ? parityReport.commandPayloadIdentity
      : readVerifiedPayloadManifest(path.join(commandRoot, "runtime-payload")).identity,
  };
}
