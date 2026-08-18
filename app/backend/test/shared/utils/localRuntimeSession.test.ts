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

import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createLocalRuntimeSession,
  readLocalRuntimeSession,
  removeLocalRuntimeSession,
} from "../../../../shared_code/utils/localRuntimeSession.js";

describe("local runtime session", () => {
  it("publishes a private descriptor for explicit launch ports", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "meadow-runtime-test-"));
    const sessionPath = path.join(directory, "session.json");
    const { session } = await createLocalRuntimeSession({
      homeDirectory: path.join(directory, "MeadowHome"),
      ownerPid: 4321,
      backendPort: 43101,
      frontendPort: 43102,
      capability: "test-only-capability",
      sessionPath,
    });

    expect(readLocalRuntimeSession(sessionPath)).toEqual(session);
    expect(session.backendUrl).toBe("http://127.0.0.1:43101/api");
    expect(session.frontendUrl).toBe("http://127.0.0.1:43102/");
    expect(statSync(sessionPath).mode & 0o777).toBe(0o600);

    removeLocalRuntimeSession(sessionPath, 9999);
    expect(readLocalRuntimeSession(sessionPath)).toEqual(session);
    removeLocalRuntimeSession(sessionPath, 4321);
    expect(() => readLocalRuntimeSession(sessionPath)).toThrow();
  });

  it("allocates distinct loopback ports and a per-session capability", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "meadow-runtime-test-"));
    const first = await createLocalRuntimeSession({
      homeDirectory: path.join(directory, "first"),
      sessionPath: path.join(directory, "first.json"),
    });
    const second = await createLocalRuntimeSession({
      homeDirectory: path.join(directory, "second"),
      sessionPath: path.join(directory, "second.json"),
    });

    expect(first.session.backendPort).not.toBe(first.session.frontendPort);
    expect(first.session.capability).not.toBe(second.session.capability);
    expect(Buffer.from(first.session.capability, "base64url")).toHaveLength(32);
  });
});
