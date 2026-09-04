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
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { getTestArtifactDirectory } from "../../src/run/artifactReporter.js";

test("parent records worker death and late teardown failure with the authoritative result", t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "meadow-artifact-reporter-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const artifacts = path.join(directory, "artifacts");
  const workerTitle = "worker exits before fixture teardown";
  const lateTitle = "late teardown failure";
  const lateDirectory = getTestArtifactDirectory(lateTitle, artifacts);
  const spec = path.join(directory, "termination.spec.ts");
  writeFileSync(spec, `
    import { test } from ${JSON.stringify(fileURLToPath(import.meta.resolve("@playwright/test")))};
    import { writeFileSync } from "node:fs";
    test(${JSON.stringify(workerTitle)}, () => { process.kill(process.pid, "SIGKILL"); });
    test(${JSON.stringify(lateTitle)}, () => {
      writeFileSync(${JSON.stringify(path.join(lateDirectory, "status.txt"))}, "passed");
    });
    test.afterEach(async ({}, info) => {
      if (info.title === ${JSON.stringify(lateTitle)}) throw new Error("failure after artifact fixture teardown");
    });
    test("subsequent test passes", () => {});
  `);
  const configuration = path.join(directory, "playwright.config.ts");
  writeFileSync(configuration, `export default ${JSON.stringify({
    testDir: directory, testMatch: "termination.spec.ts", workers: 1, retries: 0,
    outputDir: path.join(directory, "playwright-output"),
    reporter: [[fileURLToPath(new URL("../../src/run/artifactReporter.ts", import.meta.url)), { outputDir: artifacts }]],
  })};`);
  const result = spawnSync(process.execPath, [
    fileURLToPath(import.meta.resolve("@playwright/test/cli")), "test", "--config", configuration,
  ], { cwd: directory, encoding: "utf8", timeout: 30_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stdout + result.stderr);

  for (const [title, reason] of [[workerTitle, /SIGKILL/], [lateTitle, /failure after artifact fixture teardown/]] as const) {
    const artifactDirectory = getTestArtifactDirectory(title, artifacts);
    assert.equal(readFileSync(path.join(artifactDirectory, "status.txt"), "utf8"), "failed");
    assert.match(readFileSync(path.join(artifactDirectory, "failure-reason.txt"), "utf8"), reason);
    assert.equal(realpathSync(readFileSync(path.join(artifactDirectory, "test-file.txt"), "utf8")), realpathSync(spec));
    const start = Date.parse(readFileSync(path.join(artifactDirectory, "start-time.txt"), "utf8"));
    const end = Date.parse(readFileSync(path.join(artifactDirectory, "end-time.txt"), "utf8"));
    assert.ok(Number.isFinite(start) && end >= start);
  }
  assert.equal(readFileSync(path.join(getTestArtifactDirectory("subsequent test passes", artifacts), "status.txt"), "utf8"), "passed");
});
