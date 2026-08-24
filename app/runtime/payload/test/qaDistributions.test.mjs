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
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPayloadManifest } from "../src/buildRuntimePayload.mjs";
import {
  assembleCommandDistribution,
  createPayloadParityReport,
} from "../src/qaDistributions.mjs";

function makePayload(root, contents = "same\n") {
  for (const file of [
    "bin/node",
    "native/fast_git_ops_bin",
    "native/source_page_search_by_title_bin",
    "native/working_graph_bin",
    "service/dist/runtime/service/src/shared/app-shell/index.js",
    "supervisor/meadow-runtime-supervisor.cjs",
    "web/index.html",
    "web/server.js",
  ]) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
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
    const metadata = assembleCommandDistribution({ payloadRoot, cliBundle, cliLauncher, commandRoot });
    assert.equal(metadata.payloadIdentity, manifest.identity);

    const relocatedRoot = path.join(root, "relocated", "command");
    mkdirSync(path.dirname(relocatedRoot), { recursive: true });
    cpSync(commandRoot, relocatedRoot, { recursive: true });
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
