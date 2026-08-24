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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createPayloadManifest,
  verifyPayloadManifest,
} from "../src/buildRuntimePayload.mjs";

test("Runtime Payload identity is deterministic and content-addressed", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "meadow-runtime-payload-manifest-"));
  try {
    writeFileSync(path.join(root, "z.txt"), "last\n");
    writeFileSync(path.join(root, "a.txt"), "first\n");
    const options = { appVersion: "0.5.43", perspective: "standalone" };
    const first = createPayloadManifest(root, options);
    const second = createPayloadManifest(root, options);
    assert.deepEqual(first, second);
    assert.deepEqual(first.files.map(file => file.path), ["a.txt", "z.txt"]);
    assert.equal(verifyPayloadManifest(root, first), true);

    writeFileSync(path.join(root, "a.txt"), "changed\n");
    assert.notEqual(createPayloadManifest(root, options).identity, first.identity);
    assert.equal(verifyPayloadManifest(root, first), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
