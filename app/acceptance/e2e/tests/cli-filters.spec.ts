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

const name = linkedScenarioName(conceptText`CLI lists filters and applies default and explicit set operations as exact JSON`);

const description = linkedScenarioDescription(conceptText`Read the available filters through the CLI, then query nodes with default and explicit
combinations. Each JSON result should match the expected set of pages.`);
const sections = scenarioSections({
  inspectAvailableFilters: { type: 'test', text: conceptText`Inspect available filters.` },
  applyDefaultCombination: { type: 'test', text: conceptText`Apply the default combination.` },
  applyExplicitIntersection: { type: 'test', text: conceptText`Apply an explicit intersection.` },
});
const areas = scenarioAreas([bundleCuration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'a2b621ca-663b-4ca5-a6a8-432abbbe713e' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  assertMeadowHomeState,
  meadowCli,
  checkpoint,
}) => {
  await test.step(sections.steps.inspectAvailableFilters, async () => {
    const filters = await sourceCommand(() => meadowCli.run(
      ["bundle", "filters", "meadow-test-bundle-big"],
      { artifactName: "big-bundle-filters" },
    ));
    expect(filters).toBe(readCliFixture("big-bundle-filters.json"));

    await sourceCommand(() => checkpoint("available filters match the expected definitions"));
  });

  await test.step(sections.steps.applyDefaultCombination, async () => {
    const defaultFilteredNodes = await sourceCommand(() => meadowCli.run(
      [
        "bundle", "nodes", "meadow-test-bundle-big", "--scope", "all",
        "--filter", "untracked-filter=solo",
        "--filter", "sensitive-filter=exclude",
      ],
      { artifactName: "big-bundle-default-filtered-nodes" },
    ));
    expect(defaultFilteredNodes).toBe(readCliFixture("big-bundle-default-filtered-nodes.json"));

    await sourceCommand(() => checkpoint("default filters return the expected nodes"));
  });

  await test.step(sections.steps.applyExplicitIntersection, async () => {
    const explicitlyFilteredNodes = await sourceCommand(() => meadowCli.run(
      [
        "bundle", "nodes", "meadow-test-bundle-big", "--scope", "all",
        "--filter", "custom-filter-1750826014295-r7b2079ch=solo",
        "--filter", "sensitive-filter=exclude",
        "--combine", "intersection",
      ],
      { artifactName: "big-bundle-intersection-filtered-nodes" },
    ));
    expect(explicitlyFilteredNodes).toBe(readCliFixture("big-bundle-intersection-filtered-nodes.json"));

    void cli;
    void bundles;
    void bigBundle;
    await sourceCommand(() => checkpoint("explicit intersection returns the expected nodes"));
  });

  await sourceCommand(() => assertMeadowHomeState());
});
