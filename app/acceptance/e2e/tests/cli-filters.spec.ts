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

import { bundles } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { cli } from "../../../concepts/index.js";
import { expect, test } from "../src/run/test-fixtures.js";
import { readCliFixture } from "./cli-fixture-utils.js";

test.use({ bundleMode: "single-file" });
test.use({ executionSurface: "cli" });
test.use({ recordVideo: false });

test("CLI lists filters and applies default and explicit set operations as exact JSON", async ({
  assertMeadowHomeState,
  meadowCli,
}) => {
  const filters = await meadowCli.run(
    ["bundle", "filters", "meadow-test-bundle-big"],
    { artifactName: "big-bundle-filters" },
  );
  expect(filters).toBe(readCliFixture("big-bundle-filters.json"));

  const defaultFilteredNodes = await meadowCli.run(
    [
      "bundle", "nodes", "meadow-test-bundle-big", "--scope", "all",
      "--filter", "untracked-filter=solo",
      "--filter", "sensitive-filter=exclude",
    ],
    { artifactName: "big-bundle-default-filtered-nodes" },
  );
  expect(defaultFilteredNodes).toBe(readCliFixture("big-bundle-default-filtered-nodes.json"));

  const explicitlyFilteredNodes = await meadowCli.run(
    [
      "bundle", "nodes", "meadow-test-bundle-big", "--scope", "all",
      "--filter", "custom-filter-1750826014295-r7b2079ch=solo",
      "--filter", "sensitive-filter=exclude",
      "--combine", "intersection",
    ],
    { artifactName: "big-bundle-intersection-filtered-nodes" },
  );
  expect(explicitlyFilteredNodes).toBe(readCliFixture("big-bundle-intersection-filtered-nodes.json"));

  void cli;
  void bundles;
  void bigBundle;
  await assertMeadowHomeState();
});
