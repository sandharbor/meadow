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

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { activateNormalConfig } from "../../../tooling/dev_tools/src/server/normalConfig.js";

const roots: string[] = [];

function paths() {
  const root = mkdtempSync(path.join(tmpdir(), "meadow-dev-tools-normal-"));
  roots.push(root);
  return {
    configDirectory: path.join(root, "MeadowHome"),
    normalConfigBackup: path.join(root, "MeadowHome_normal"),
    activeFixtureFile: path.join(root, "meadow_active_fixture"),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Dev Tools Normal mode", () => {
  it("proceeds without changing an already-normal Meadow Home", () => {
    const options = paths();
    mkdirSync(options.configDirectory);
    const marker = path.join(options.configDirectory, "real-home-marker.txt");
    writeFileSync(marker, "preserve me");
    writeFileSync(options.activeFixtureFile, "stale-fixture-marker");

    expect(activateNormalConfig(options)).toBe("already-normal");
    expect(readFileSync(marker, "utf8")).toBe("preserve me");
    expect(existsSync(options.normalConfigBackup)).toBe(false);
    expect(existsSync(options.activeFixtureFile)).toBe(false);
  });

  it("replaces a test fixture with the backed-up normal Meadow Home", () => {
    const options = paths();
    mkdirSync(options.configDirectory);
    writeFileSync(path.join(options.configDirectory, "fixture-marker.txt"), "fixture");
    mkdirSync(options.normalConfigBackup);
    writeFileSync(path.join(options.normalConfigBackup, "real-home-marker.txt"), "normal");
    writeFileSync(options.activeFixtureFile, "home_fixture_example");

    expect(activateNormalConfig(options)).toBe("restored-backup");
    expect(readFileSync(
      path.join(options.configDirectory, "real-home-marker.txt"),
      "utf8",
    )).toBe("normal");
    expect(existsSync(path.join(options.configDirectory, "fixture-marker.txt"))).toBe(false);
    expect(existsSync(options.normalConfigBackup)).toBe(false);
    expect(existsSync(options.activeFixtureFile)).toBe(false);
  });
});
