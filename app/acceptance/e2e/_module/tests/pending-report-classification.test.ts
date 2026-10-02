/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { declaredScenarioOptions } from "../../src/artifacts/declaredScenarioOptions.js";

test("pending report classification uses captured declarations and respects fixture metadata", t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "pending-report-classification-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const assemble = () => {
    const result = spawnSync(process.execPath, [
      "--preserve-symlinks", "--preserve-symlinks-main", "--import", "tsx", "--input-type", "module", "--eval",
      `import { assembleTestArtifacts } from ${JSON.stringify(new URL("../../src/artifacts/assemble.ts", import.meta.url).href)};
       assembleTestArtifacts(${JSON.stringify(directory)});`,
    ], { encoding: "utf8", timeout: 20_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  const liveFile = path.join(directory, "scenario.spec.ts");
  const captured = 'test.use({ bundleMode: "single-folder" });\n'
    + 'test.use({ executionSurfaces: ["dev-tools", "browser"] });\n'
    + 'test.fixme("planned", async () => {});';
  writeFileSync(liveFile, 'test.use({ bundleMode: "multiple-folders" });');
  writeFileSync(path.join(directory, "test-file.txt"), liveFile);
  writeFileSync(path.join(directory, "test-source.ts"), captured);
  writeFileSync(path.join(directory, "status.txt"), "skipped");
  assemble();
  const manifest = () => JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8"));
  assert.equal(manifest().bundleMode, "single-folder");
  assert.deepEqual(manifest().executionSurfaces, ["dev-tools", "browser"]);
  assert.equal(manifest().status, "skipped");
  assert.deepEqual(manifest().keyFrames, []);

  writeFileSync(path.join(directory, "bundle-mode.txt"), "mixed-starts");
  writeFileSync(path.join(directory, "execution-surface.txt"), "cli");
  writeFileSync(path.join(directory, "execution-surfaces.json"), '["cli"]');
  assemble();
  assert.equal(manifest().bundleMode, "mixed-starts");
  assert.deepEqual(manifest().executionSurfaces, ["cli"]);
});

test("declaration fallback does not invent classification from comments, nested calls, or dynamic values", () => {
  assert.deepEqual(declaredScenarioOptions(`
    // test.use({ bundleMode: "single-file" });
    const text = 'test.use({ executionSurface: "cli" });';
    function unrelated() { test.use({ bundleMode: "mixed-starts" }); }
    test.use({ bundleMode: dynamicMode, executionSurfaces: ["browser", dynamicSurface] });
    other.use({ bundleMode: "single-folder" });
  `), {});
});
