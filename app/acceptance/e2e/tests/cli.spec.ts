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

import { bundles, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { cli } from "../../../concepts/index.js";
import { expect, test } from "../src/run/test-fixtures.js";

interface BundleSummary {
  slug: string;
  archivedAt?: string | null;
}

interface BundleMutationResult {
  success: true;
  slug: string;
  archivedAt: string | null;
}

test.use({ bundleMode: "single-file" });
test.use({ executionSurface: "cli" });
test.use({ recordVideo: false });

const name = linkedScenarioName(conceptText`CLI archives and lists current and archived bundles as JSON`);

const description = linkedScenarioDescription(conceptText`Archive a bundle through the CLI and inspect the current and archived lists. Restore it
and check that command help describes the supported operations.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'bcd26c10-bbf1-4558-8c9d-8799e8b0abfe' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  assertMeadowHomeState,
  meadowCli,
  checkpoint,
}) => {
  // --- Test start ---
  // Archive the small bundle.
  const archived = await sourceCommand(() => meadowCli.runJson<BundleMutationResult>(
    ["bundles", "archive", "meadow-test-bundle-small"],
    { artifactName: "archive-small-bundle" },
  ));
  expect(archived).toMatchObject({
    schemaVersion: 1,
    operation: "bundles.archive",
    success: true,
    slug: "meadow-test-bundle-small",
    changed: true,
    mutationBehavior: {
      atomicity: "atomic",
      idempotency: "not-idempotent",
      staleWrite: "latest-state-wins",
    },
    archivedAt: expect.any(String),
  });

  await sourceCommand(() => checkpoint("the small bundle is archived"));

  // Inspect both bundle lists.
  const currentBundles = await sourceCommand(() => meadowCli.runJson<BundleSummary[]>(
    ["bundles", "list"],
    { artifactName: "current-bundles" },
  ));
  expect(currentBundles.map((bundle) => bundle.slug)).toEqual(["meadow-test-bundle-big"]);
  expect(currentBundles.every((bundle) => !bundle.archivedAt)).toBe(true);

  const archivedBundles = await sourceCommand(() => meadowCli.runJson<BundleSummary[]>(
    ["bundles", "list", "--archived"],
    { artifactName: "archived-bundles" },
  ));
  expect(archivedBundles.map((bundle) => bundle.slug)).toEqual(["meadow-test-bundle-small"]);
  expect(archivedBundles[0].archivedAt).toEqual(expect.any(String));

  await sourceCommand(() => checkpoint("current and archived lists contain the expected bundles"));

  // Restore the small bundle.
  const unarchived = await sourceCommand(() => meadowCli.runJson<BundleMutationResult>(
    ["bundles", "unarchive", "meadow-test-bundle-small"],
    { artifactName: "unarchive-small-bundle" },
  ));
  expect(unarchived).toMatchObject({
    schemaVersion: 1,
    operation: "bundles.unarchive",
    success: true,
    slug: "meadow-test-bundle-small",
    changed: true,
    mutationBehavior: {
      atomicity: "atomic",
      idempotency: "idempotent",
      staleWrite: "latest-state-wins",
    },
    archivedAt: null,
  });

  const restoredBundles = await sourceCommand(() => meadowCli.runJson<BundleSummary[]>(
    ["bundles", "list"],
    { artifactName: "restored-current-bundles" },
  ));
  expect(restoredBundles.map((bundle) => bundle.slug).sort()).toEqual([
    "meadow-test-bundle-big",
    "meadow-test-bundle-small",
  ]);

  await sourceCommand(() => checkpoint("the restored bundle returns to the current list"));

  // Check command help.
  const help = await sourceCommand(() => meadowCli.run(
    ["--help"],
    { artifactName: "cli-help" },
  ));
  expect(help).toContain("List current bundles as JSON");
  expect(help).toContain("meadow bundles list --archived");
  expect(help).toContain("meadow bundles archive <bundle-slug>");
  expect(help).toContain("meadow bundles unarchive <bundle-slug>");
  expect(help).toContain("meadow bundle nodes <bundle-slug> --scope <all|final>");
  expect(help).toContain("meadow bundle filters <bundle-slug>");
  expect(help).toContain("meadow bundle versions <list|get|create|update|delete|restore|cancel-current>");
  expect(help).toContain("meadow bundle publications <list|get|configure|plan|cancel|delete>");
  expect(help).toContain("meadow bundles rename-plan <bundle-slug>");
  expect(help).toContain("meadow providers list");
  void cli;
  void bundles;

  await sourceCommand(() => checkpoint("help documents bundle and history commands"));

  await sourceCommand(() => assertMeadowHomeState());
});
