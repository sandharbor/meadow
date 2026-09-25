/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "../src/run/test-fixtures.js";
import { BundleListPage } from "../src/run/pages/index.js";
import { emptyHome, homeCommit } from "../../../concepts/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: "empty" });

/*
 * Launch Meadow when its home folder does not exist, as on a fresh install. The
 * application creates the home, records its format, makes the initial Meadow Home
 * commit, and opens an empty bundle list that invites the first bundle.
 */
test("Fresh install creates the Meadow Home and opens an empty bundle list", async ({ page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Test start ---
  // Open the application against a home that did not exist before launch.
  const bundleList = new BundleListPage(page, expect);
  await bundleList.goto();
  await bundleList.expectCalloutVisible("Turn your notes into bundles");
  await addKeyFrame(emptyHome);
  await checkpoint("a fresh install opens the empty bundle list");

  // Check the home the application created.
  const home = testServer.configDir;
  expect(fs.readFileSync(path.join(home, "meadow_home.yaml"), "utf8")).toContain("formatVersion: 1");
  const commits = execFileSync("git", ["log", "--format=%s"], { cwd: home, encoding: "utf8" }).trim().split("\n");
  expect(commits.at(-1)).toBe("meadow_app: initial Meadow Home commit");
  const ignored = fs.readFileSync(path.join(home, ".gitignore"), "utf8");
  expect(ignored).toContain("app/resources.local.yaml");
  await addKeyFrame(homeCommit);
  await checkpoint("the application made the initial Meadow Home commit");

  await assertMeadowHomeState();
});
