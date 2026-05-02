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

import { execSync } from "child_process";
import { test, expect } from "../src/run/test-fixtures.js";
import { SiteListPage, SiteEditorPage } from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { git } from "../src/scenario-docs/index.js";
import { exampleSite } from "../src/site-docs/index.js";

test.use({ fixtureHome: Fixture.None });

test("MeadowHome is a real (non-bare) git repo after creating the example site", async ({
  page, snapshot, addKeyFrame, testServer,
}) => {
  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);

  // Empty-state path: no fixture, click the "add the example site" link
  // in the empty site list, then land in the editor for example-site.
  await siteList.goto();
  await snapshot("empty site list");

  await siteList.clickAddExampleSiteLink();
  await editor.waitForLoad("example-site");
  await snapshot("example site editor loaded");

  // Use the system `git` CLI (not fast_git_ops) to confirm MeadowHome is
  // a normal repo with a working tree. fast_git_ops initializes the repo
  // via `gix::init_bare`, which sets core.bare=true and makes plain
  // `git status` fail with "fatal: this operation must be run in a work
  // tree" — that's the regression this test guards against.
  const runRealGitStatus = () => {
    try {
      return execSync("git status --porcelain", {
        cwd: testServer.configDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const e = err as { stderr?: Buffer | string; message: string };
      const stderr = typeof e.stderr === "string"
        ? e.stderr
        : e.stderr?.toString("utf8") ?? "";
      throw new Error(
        `Real \`git status\` failed in MeadowHome at ${testServer.configDir}. ` +
        `This usually means the repo was initialized as bare (core.bare=true) ` +
        `and has no working tree.\nstderr:\n${stderr}\noriginal error: ${e.message}`,
      );
    }
  };

  // The backend's commit happens async after the editor finishes loading;
  // retry briefly so we don't race it. Same retry budget as
  // MeadowHomeGit.expectDirFullyCommitted.
  let status = "";
  for (let attempt = 0; attempt <= 10; attempt++) {
    status = runRealGitStatus().trim();
    if (status === "") break;
    if (attempt < 10) await new Promise((r) => setTimeout(r, 1000));
  }

  expect(
    status,
    `Expected MeadowHome to have no untracked or changed files after ` +
    `creating the example site, but \`git status --porcelain\` reports:\n${status}`,
  ).toBe("");

  await addKeyFrame(git);
  await snapshot("MeadowHome clean via real git status");
  void exampleSite;
});
