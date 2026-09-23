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

/*
 * Request both the working graph and final graph through the CLI. Compare their JSON
 * output with the expected node inventories.
 */
test("CLI describes all and final nodes in the big bundle as exact JSON", async ({
  assertMeadowHomeState,
  meadowCli,
  snapshot,
}) => {
  // --- Test start ---
  // Inspect the working graph.
  const allNodes = await meadowCli.run(
    ["bundle", "nodes", "meadow-test-bundle-big", "--scope", "all"],
    { artifactName: "big-bundle-all-nodes" },
  );
  expect(allNodes).toBe(readCliFixture("big-bundle-all-nodes.json"));

  await snapshot("all nodes match the expected graph");

  // Inspect the final graph.
  const finalNodes = await meadowCli.run(
    ["bundle", "nodes", "meadow-test-bundle-big", "--scope", "final"],
    { artifactName: "big-bundle-final-nodes" },
  );
  expect(finalNodes).toBe(readCliFixture("big-bundle-final-nodes.json"));

  void cli;
  void bundles;
  void bigBundle;
  await snapshot("final nodes match the expected export");

  await assertMeadowHomeState();
});
