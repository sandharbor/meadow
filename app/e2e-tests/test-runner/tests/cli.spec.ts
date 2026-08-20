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

import { bundles } from "../src/app-area-docs/index.js";
import { cli } from "../src/scenario-docs/index.js";
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

test("CLI archives and lists current and archived bundles as JSON", async ({
  assertMeadowHomeState,
  meadowCli,
}) => {
  const archived = await meadowCli.runJson<BundleMutationResult>(
    ["bundles", "archive", "meadow-test-bundle-small"],
    { artifactName: "archive-small-bundle" },
  );
  expect(archived).toMatchObject({
    success: true,
    slug: "meadow-test-bundle-small",
    archivedAt: expect.any(String),
  });

  const currentBundles = await meadowCli.runJson<BundleSummary[]>(
    ["bundles", "list"],
    { artifactName: "current-bundles" },
  );
  expect(currentBundles.map((bundle) => bundle.slug)).toEqual(["meadow-test-bundle-big"]);
  expect(currentBundles.every((bundle) => !bundle.archivedAt)).toBe(true);

  const archivedBundles = await meadowCli.runJson<BundleSummary[]>(
    ["bundles", "list", "--archived"],
    { artifactName: "archived-bundles" },
  );
  expect(archivedBundles.map((bundle) => bundle.slug)).toEqual(["meadow-test-bundle-small"]);
  expect(archivedBundles[0].archivedAt).toEqual(expect.any(String));

  const unarchived = await meadowCli.runJson<BundleMutationResult>(
    ["bundles", "unarchive", "meadow-test-bundle-small"],
    { artifactName: "unarchive-small-bundle" },
  );
  expect(unarchived).toMatchObject({
    success: true,
    slug: "meadow-test-bundle-small",
    archivedAt: null,
  });

  const restoredBundles = await meadowCli.runJson<BundleSummary[]>(
    ["bundles", "list"],
    { artifactName: "restored-current-bundles" },
  );
  expect(restoredBundles.map((bundle) => bundle.slug).sort()).toEqual([
    "meadow-test-bundle-big",
    "meadow-test-bundle-small",
  ]);

  const help = await meadowCli.run(
    ["--help"],
    { artifactName: "cli-help" },
  );
  expect(help).toContain("List current bundles as JSON");
  expect(help).toContain("meadow bundles list --archived");
  expect(help).toContain("meadow bundles archive <bundle-slug>");
  expect(help).toContain("meadow bundles unarchive <bundle-slug>");
  expect(help).toContain("meadow bundle nodes <bundle-slug> --scope <all|final>");
  expect(help).toContain("meadow bundle filters <bundle-slug>");
  void cli;
  void bundles;

  await assertMeadowHomeState();
});
