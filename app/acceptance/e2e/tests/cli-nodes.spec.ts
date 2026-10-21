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

import { scenarioSections, bundles, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { cli } from "../../../concepts/index.js";
import { expect, test } from "../src/run/test-fixtures.js";
import { readCliFixture } from "./cli-fixture-utils.js";

test.use({ bundleMode: "single-file" });
test.use({ executionSurface: "cli" });
test.use({ recordVideo: false });

const name = linkedScenarioName(conceptText`CLI describes all and final nodes in the big bundle as exact JSON`);

const description = linkedScenarioDescription(conceptText`Request both the working graph and final graph through the CLI. Compare their JSON
output with the expected node inventories.`);
const sections = scenarioSections({
  inspectWorkingGraph: { type: 'test', text: conceptText`Inspect the working graph.` },
  inspectFinalGraph: { type: 'test', text: conceptText`Inspect the final graph.` },
});
const areas = scenarioAreas([bundleCuration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '380064ce-e016-4815-8cc4-752cbd3c35fa' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  assertMeadowHomeState,
  meadowCli,
  checkpoint,
}) => {
  await test.step(sections.steps.inspectWorkingGraph, async () => {
    const allNodes = await sourceCommand(() => meadowCli.run(
      ["bundle", "nodes", "meadow-test-bundle-big", "--scope", "all"],
      { artifactName: "big-bundle-all-nodes" },
    ));
    expect(allNodes).toBe(readCliFixture("big-bundle-all-nodes.json"));

    await sourceCommand(() => checkpoint("all nodes match the expected graph"));
  });

  await test.step(sections.steps.inspectFinalGraph, async () => {
    const finalNodes = await sourceCommand(() => meadowCli.run(
      ["bundle", "nodes", "meadow-test-bundle-big", "--scope", "final"],
      { artifactName: "big-bundle-final-nodes" },
    ));
    expect(finalNodes).toBe(readCliFixture("big-bundle-final-nodes.json"));

    void cli;
    void bundles;
    void bigBundle;
    await sourceCommand(() => checkpoint("final nodes match the expected export"));
  });

  await sourceCommand(() => assertMeadowHomeState());
});
