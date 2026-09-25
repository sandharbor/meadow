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

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SavedStateRefusal, SavedStateSession } from "../../../tooling/dev_tools/src/server/savedStateSession.js";

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const roots: string[] = [];

function session() {
  const root = mkdtempSync(path.join(tmpdir(), "meadow-dev-tools-saved-states-"));
  roots.push(root);
  const normalHome = path.join(root, "MeadowHome");
  mkdirSync(normalHome);
  writeFileSync(path.join(normalHome, "real-home-marker.txt"), "preserve me");
  return { root, normalHome, session: new SavedStateSession({ projectRoot, normalHome, homesDirectory: path.join(root, "dev-homes") }) };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Dev Tools saved states", () => {
  it("opens Normal as the real Meadow Home without moving it", async () => {
    const { normalHome, session: saved } = session();
    expect(saved.current().homeDirectory).toBe(normalHome);
    const opened = await saved.open({ kind: "normal" }, "hosted");
    expect(opened.homeDirectory).toBe(normalHome);
    expect(readFileSync(path.join(normalHome, "real-home-marker.txt"), "utf8")).toBe("preserve me");
  });

  it("opens each fixture into its own home and never writes Git or the real home", async () => {
    const { root, normalHome, session: saved } = session();
    const first = await saved.open({ kind: "fixture", fixture: "home_fixture_example" }, "hosted");
    const second = await saved.open({ kind: "fixture", fixture: "home_fixture_example" }, "hosted");
    expect(first.homeDirectory).not.toBe(second.homeDirectory);
    expect(existsSync(path.join(first.homeDirectory, "bundles/example-bundle/config/bundle_config.yaml"))).toBe(true);
    expect(existsSync(path.join(second.homeDirectory, ".git"))).toBe(false);
    expect(readFileSync(path.join(second.homeDirectory, "bundles/example-bundle/config/bundle_config.yaml"), "utf8"))
      .toContain(path.join(second.homeDirectory, "source_graphs/example-bundle-data"));
    expect(saved.openSourceGraphs()).toEqual(["example-bundle-data"]);
    expect(saved.current().homeDirectory).toBe(second.homeDirectory);
    expect(readdirSync(normalHome)).toEqual(["real-home-marker.txt"]);
    expect(existsSync(path.join(root, "MeadowHome_normal"))).toBe(false);
  });

  it("opens the Empty Home as a folder that does not exist, and only with Hosted Development", async () => {
    const { session: saved } = session();
    await expect(saved.open({ kind: "empty" }, "local")).rejects.toBeInstanceOf(SavedStateRefusal);
    const empty = await saved.open({ kind: "empty" }, "hosted");
    expect(existsSync(empty.homeDirectory)).toBe(false);
    expect(empty.serviceEnvironment.MEADOW_LOG_DIRECTORY_OVERRIDE).toBe(empty.logsDirectory);
  });
});
