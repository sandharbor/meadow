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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRuntimePayloadLaunchSpec, parseRuntimePayloadManifest } from "../src/runtimePayload.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function manifest() {
  return {
    schemaVersion: 1,
    protocol: "meadow-local-v1",
    identity: `sha256:${"a".repeat(64)}`,
    appVersion: "0.5.43",
    perspective: "standalone",
    files: [{ path: "bin/node", bytes: 1, sha256: "b".repeat(64) }],
  } as const;
}

describe("Runtime Payload", () => {
  it("parses a deterministic sorted manifest", () => {
    expect(parseRuntimePayloadManifest(manifest())).toEqual(manifest());
    expect(() => parseRuntimePayloadManifest({
      ...manifest(),
      files: [...manifest().files, ...manifest().files],
    })).toThrow("unique and sorted");
  });

  it("creates relocatable child launch commands from the payload root", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "meadow-runtime-payload-launch-"));
    roots.push(root);
    mkdirSync(path.join(root, "bin"), { recursive: true });
    writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest()));
    const spec = createRuntimePayloadLaunchSpec({
      payloadRoot: root,
      homeDirectory: path.join(root, "Home"),
    });
    expect(spec.payload.identity).toBe(manifest().identity);
    expect(spec.service.executable).toBe(path.join(root, "bin/node"));
    expect(spec.service.cwd).toBe(path.join(root, "service"));
    expect(spec.web.cwd).toBe(path.join(root, "web"));
    expect(spec.service.environment?.WORKING_GRAPH_PATH).toBe(path.join(root, "native/working_graph_bin"));
  });
});
