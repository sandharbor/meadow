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
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliBundle = path.join(cliRoot, "dist/meadow.cjs");
const meadowRoot = path.resolve(cliRoot, "../../..");

function runCli(args, environment = {}) {
  return spawnSync(process.execPath, [cliBundle, ...args], {
    cwd: meadowRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      MEADOW_PROJECT_ROOT: path.join(cliRoot, "test/missing-project"),
      MEADOW_RUNTIME_PAYLOAD_ROOT: path.join(cliRoot, "test/missing-payload"),
      ...environment,
    },
  });
}

test("version forms print the product version without requiring the Runtime", () => {
  for (const argument of ["version", "--version", "-v"]) {
    const result = runCli([argument], { MEADOW_APP_VERSION: "9.8.7-test" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "meadow 9.8.7-test\n");
  }
});

test("source builds fall back to the Desktop product version", () => {
  const desktopPackage = JSON.parse(readFileSync(
    path.join(meadowRoot, "app/hosts/desktop/package.json"),
    "utf8",
  ));
  const environment = { ...process.env };
  delete environment.MEADOW_APP_VERSION;
  const result = spawnSync(process.execPath, [cliBundle, "--version"], {
    cwd: meadowRoot,
    encoding: "utf8",
    env: environment,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, `meadow ${desktopPackage.version}\n`);
});

test("packaged builds use their distribution metadata", (context) => {
  const commandRoot = mkdtempSync(path.join(os.tmpdir(), "meadow-command-version-"));
  context.after(() => rmSync(commandRoot, { force: true, recursive: true }));
  const packagedBundle = path.join(commandRoot, "bin/meadow.cjs");
  mkdirSync(path.dirname(packagedBundle), { recursive: true });
  copyFileSync(cliBundle, packagedBundle);
  writeFileSync(
    path.join(commandRoot, "artifact.json"),
    `${JSON.stringify({ appVersion: "7.6.5-packaged" }, null, 2)}\n`,
  );

  const result = spawnSync(process.execPath, [packagedBundle, "--version"], {
    encoding: "utf8",
    env: { ...process.env, MEADOW_APP_VERSION: "1.2.3-environment" },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "meadow 7.6.5-packaged\n");
});

test("top-level help advertises version reporting", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /meadow version/);
  assert.match(result.stdout, /version, --version, -v\s+Print the installed Meadow version\./);
});
