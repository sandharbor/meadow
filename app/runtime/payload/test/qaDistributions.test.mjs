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

import assert from "node:assert/strict";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildCommandArtifact } from "../src/buildCommandArtifact.mjs";
import { createPayloadManifest } from "../src/buildRuntimePayload.mjs";
import {
  assembleCommandDistribution,
  createPayloadParityReport,
} from "../src/qaDistributions.mjs";
import { RUNTIME_PAYLOAD_CRITICAL_FILES } from "../src/runtimePayloadDefinition.mjs";

function makePayload(root, contents = "same\n") {
  for (const file of RUNTIME_PAYLOAD_CRITICAL_FILES) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  const dependencyRoot = path.join(root, "service/node_modules/example");
  mkdirSync(path.join(dependencyRoot, ".bin"), { recursive: true });
  writeFileSync(path.join(dependencyRoot, "cli.js"), contents);
  symlinkSync("../cli.js", path.join(dependencyRoot, ".bin/example"));
  const manifest = createPayloadManifest(root, { appVersion: "0.5.43", perspective: "standalone" });
  writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

test("Command assembly is relocatable and preserves the verified Runtime Payload", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "meadow-command-distribution-"));
  try {
    const payloadRoot = path.join(root, "payload");
    mkdirSync(payloadRoot);
    const manifest = makePayload(payloadRoot);
    const cliBundle = path.join(root, "meadow.cjs");
    const cliLauncher = path.join(root, "meadow");
    writeFileSync(cliBundle, "console.log('meadow')\n");
    writeFileSync(cliLauncher, "#!/bin/sh\n");
    chmodSync(cliLauncher, 0o755);
    const commandRoot = path.join(root, "command");
    const metadata = assembleCommandDistribution({
      payloadRoot,
      cliBundle,
      cliLauncher,
      commandRoot,
      status: "local-signed",
      platform: "darwin",
      arch: "arm64",
    });
    assert.equal(metadata.payloadIdentity, manifest.identity);
    assert.equal(metadata.status, "local-signed");
    assert.equal(metadata.platform, "darwin");
    assert.equal(metadata.arch, "arm64");
    assert.equal(
      readlinkSync(path.join(commandRoot, "runtime-payload/service/node_modules/example/.bin/example")),
      "../cli.js",
    );

    const relocatedRoot = path.join(root, "relocated", "command");
    mkdirSync(path.dirname(relocatedRoot), { recursive: true });
    cpSync(commandRoot, relocatedRoot, { recursive: true, verbatimSymlinks: true });
    const report = createPayloadParityReport({
      perspective: "standalone",
      desktopPayloadRoot: payloadRoot,
      commandPayloadRoot: path.join(relocatedRoot, "runtime-payload"),
    });
    assert.equal(report.result, "pass");
    assert.equal(report.identityMatch, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Payload parity identifies a critical-file mismatch", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "meadow-payload-parity-"));
  try {
    const desktop = path.join(root, "desktop");
    const command = path.join(root, "command");
    mkdirSync(desktop);
    mkdirSync(command);
    makePayload(desktop);
    makePayload(command, "different\n");
    const report = createPayloadParityReport({
      perspective: "standalone",
      desktopPayloadRoot: desktop,
      commandPayloadRoot: command,
    });
    assert.equal(report.result, "fail");
    assert.equal(report.identityMatch, false);
    assert.equal(report.criticalFileChecks.every(check => !check.match), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Command artifact build owns CLI compilation, assembly, and archiving", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "meadow-command-artifact-"));
  try {
    const payloadRoot = path.join(root, "payload");
    mkdirSync(payloadRoot);
    const manifest = makePayload(payloadRoot);
    const cliBundle = path.join(root, "meadow.cjs");
    const cliLauncher = path.join(root, "meadow");
    writeFileSync(cliBundle, "console.log('meadow')\n");
    writeFileSync(cliLauncher, "#!/bin/sh\n");
    chmodSync(cliLauncher, 0o755);
    const commandRoot = path.join(root, "Meadow-Command-test");
    const commandArchive = `${commandRoot}.zip`;
    const commands = [];

    const result = buildCommandArtifact({
      payloadRoot,
      commandRoot,
      commandArchive,
      status: "local-signed",
      platform: "darwin",
      arch: "arm64",
      cliBundle,
      cliLauncher,
      runCommand(command, args, cwd, environment) {
        commands.push({ command, args, cwd, environment });
        if (command === "/usr/bin/ditto") writeFileSync(commandArchive, "archive\n");
      },
    });

    assert.equal(result.metadata.payloadIdentity, manifest.identity);
    assert.equal(result.metadata.status, "local-signed");
    assert.equal(commands[0].command, "npm");
    assert.equal(commands[0].environment.MEADOW_BUILD_PERSPECTIVE, "standalone");
    assert.deepEqual(commands[1].args, [
      "-c",
      "-k",
      "--keepParent",
      commandRoot,
      commandArchive,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
