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
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createPayloadManifest,
  verifyPayloadManifest,
} from "../src/buildRuntimePayload.mjs";
import { RUNTIME_PAYLOAD_EXECUTABLE_PATHS } from "../src/runtimePayloadDefinition.mjs";
import {
  signRuntimePayload,
  verifySignedRuntimePayload,
} from "../src/signRuntimePayload.mjs";

function makePayload(root) {
  writeFileSync(path.join(root, ".meadow-runtime-payload"), "Meadow Runtime Payload\n");
  for (const relativePath of RUNTIME_PAYLOAD_EXECUTABLE_PATHS) {
    const executable = path.join(root, relativePath);
    mkdirSync(path.dirname(executable), { recursive: true });
    writeFileSync(executable, `unsigned:${relativePath}\n`);
  }
  const manifest = createPayloadManifest(root, {
    appVersion: "0.5.45",
    perspective: "standalone",
  });
  writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

test("signing uses the canonical executable inventory and refreshes content identity", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "meadow-runtime-payload-sign-"));
  try {
    const entitlementsPath = path.join(root, "entitlements.plist");
    writeFileSync(entitlementsPath, "<plist/>\n");
    const initialManifest = makePayload(root);
    const signedPaths = [];
    const signedManifest = signRuntimePayload({
      payloadRoot: root,
      identity: "Developer ID Application: Example (TEAMID)",
      entitlementsPath,
      runCommand(command, args) {
        assert.equal(command, "/usr/bin/codesign");
        assert.deepEqual(args.slice(0, 4), ["--force", "--options", "runtime", "--timestamp"]);
        assert.equal(args.includes(entitlementsPath), true);
        const executable = args.at(-1);
        signedPaths.push(path.relative(root, executable));
        appendFileSync(executable, "simulated-signature\n");
      },
    });

    assert.deepEqual(signedPaths, RUNTIME_PAYLOAD_EXECUTABLE_PATHS);
    assert.notEqual(signedManifest.identity, initialManifest.identity);
    assert.equal(verifyPayloadManifest(root, signedManifest), true);
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")),
      signedManifest,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("signed verification checks both the manifest and every executable signature", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "meadow-runtime-payload-verify-"));
  try {
    makePayload(root);
    const verifiedPaths = [];
    const manifest = verifySignedRuntimePayload({
      payloadRoot: root,
      runCommand(command, args) {
        assert.equal(command, "/usr/bin/codesign");
        assert.deepEqual(args.slice(0, 3), ["--verify", "--strict", "--verbose=2"]);
        verifiedPaths.push(path.relative(root, args.at(-1)));
      },
    });
    assert.equal(manifest.appVersion, "0.5.45");
    assert.deepEqual(verifiedPaths, RUNTIME_PAYLOAD_EXECUTABLE_PATHS);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("signing fails before invoking codesign when the executable inventory is incomplete", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "meadow-runtime-payload-incomplete-"));
  try {
    makePayload(root);
    rmSync(path.join(root, RUNTIME_PAYLOAD_EXECUTABLE_PATHS.at(-1)));
    assert.throws(
      () => signRuntimePayload({
        payloadRoot: root,
        identity: "Developer ID Application: Example (TEAMID)",
        runCommand() {
          assert.fail("codesign should not run for an incomplete payload");
        },
      }),
      /Runtime Payload executable is missing/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("signing refuses payload contents that do not match the input manifest", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "meadow-runtime-payload-tampered-"));
  try {
    makePayload(root);
    appendFileSync(path.join(root, RUNTIME_PAYLOAD_EXECUTABLE_PATHS[0]), "tampered\n");
    assert.throws(
      () => signRuntimePayload({
        payloadRoot: root,
        identity: "Developer ID Application: Example (TEAMID)",
        runCommand() {
          assert.fail("codesign should not run for a payload with a stale manifest");
        },
      }),
      /manifest verification failed before signing/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
