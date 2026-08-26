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

import type {
  CreateBundleCliResult,
  DescribeBundleNodeCliResult,
  FindBundleNodeCliResult,
  MutateBundleNodeCliResult,
} from "../../../contracts/types/cliOperations.js";
import { materializeCreateSafeBundleSource } from "../src/agent-evals/scenarios/createSafeBundle.js";
import { bundles } from "../../../concepts/index.js";
import { cli } from "../../../concepts/index.js";
import { expect, test } from "../src/run/test-fixtures.js";

test.use({ bundleMode: "single-file" });
test.use({ executionSurface: "cli" });
test.use({ fixtureHome: "none" });
test.use({ recordVideo: false });

test("CLI supports every single-node inspection and curation operation by path or ID", async ({
  assertMeadowHomeState,
  meadowCli,
}) => {
  const source = materializeCreateSafeBundleSource();
  const create = async (slug?: string): Promise<CreateBundleCliResult> => meadowCli.runJson([
    "bundles",
    "create",
    "--source",
    source.directory,
    "--entry",
    "Notable Mental Models.md",
    ...(slug ? ["--slug", slug] : []),
  ], { artifactName: `create-${slug ?? "primary"}` });

  try {
    await create();
    await create("node-operations-copy");

    const described = await meadowCli.runJson<DescribeBundleNodeCliResult>([
      "bundle", "node", "describe", "notable-mental-models",
      "--path", "Charlie Munger.md",
    ], { artifactName: "describe-charlie-by-path" });
    expect(described).toMatchObject({
      schemaVersion: 1,
      operation: "bundle.node.describe",
      slug: "notable-mental-models",
      locator: { kind: "path", value: "Charlie Munger.md" },
      node: {
        bundleNodeKey: "/Charlie Munger.md",
        bundleNodeName: "Charlie Munger",
        depth: expect.any(Number),
        tracked: false,
      },
    });
    expect(described.related.pathToHere.at(-1)?.bundleNodeKey).toBe("/Charlie Munger.md");
    expect(described.related.children.map(node => node.bundleNodeName)).toEqual([
      "Latticework of Mental Models",
      "Man with a Hammer",
      "Thoughts on Munger's Investment Portfolio",
    ]);
    expect(described.related.deeperPathsFromHere.map(node => node.bundleNodeName)).toEqual([
      "Charlie Munger",
      "Latticework of Mental Models",
      "Man with a Hammer",
      "Thoughts on Munger's Investment Portfolio",
    ]);
    for (const related of Object.values(described.related).flat()) {
      expect(related).toEqual(expect.objectContaining({
        bundleNodeKey: expect.any(String),
        bundleNodeName: expect.any(String),
        depth: expect.any(Number),
      }));
    }
    expect(described.related.allPathsFromHere[0].bundleNodeKey).toBe("/Charlie Munger.md");
    expect(described.related.deeperPathsFromHere[0].bundleNodeKey).toBe("/Charlie Munger.md");

    const tracked = await meadowCli.runJson<MutateBundleNodeCliResult>([
      "bundle", "node", "track", "notable-mental-models",
      "--path", "Charlie Munger.md",
    ], { artifactName: "track-charlie-by-path" });
    expect(tracked).toMatchObject({
      operation: "bundle.node.track",
      changed: true,
      mutationBehavior: {
        atomicity: "atomic",
        idempotency: "idempotent",
        staleWrite: "rejects-stale",
      },
      node: {
        tracked: true,
        blacklisted: false,
        bundleNodeId: expect.stringMatching(/^[a-z0-9]{12}$/),
      },
    });
    const nodeId = tracked.node.bundleNodeId!;

    const trackedAgain = await meadowCli.runJson<MutateBundleNodeCliResult>([
      "bundle", "node", "track", "notable-mental-models", "--id", nodeId,
    ], { artifactName: "retry-track-charlie-by-id" });
    expect(trackedAgain.changed).toBe(false);

    const copyTracked = await meadowCli.runJson<MutateBundleNodeCliResult>([
      "bundle", "node", "track", "node-operations-copy",
      "--path", "/Charlie Munger.md",
    ], { artifactName: "track-charlie-in-copy" });
    expect(copyTracked.node.bundleNodeId).not.toBe(nodeId);

    await create("node-operations-concurrent");
    const [concurrentCharlie, concurrentWarren] = await Promise.all([
      meadowCli.runJson<MutateBundleNodeCliResult>([
        "bundle", "node", "track", "node-operations-concurrent",
        "--path", "Charlie Munger.md",
      ], { artifactName: "concurrent-track-charlie" }),
      meadowCli.runJson<MutateBundleNodeCliResult>([
        "bundle", "node", "track", "node-operations-concurrent",
        "--path", "Warren Buffett.md",
      ], { artifactName: "concurrent-track-warren" }),
    ]);
    const concurrentCharlieId = concurrentCharlie.node.bundleNodeId!;
    const concurrentWarrenId = concurrentWarren.node.bundleNodeId!;
    await Promise.all([
      meadowCli.runJson<MutateBundleNodeCliResult>([
        "bundle", "node", "blacklist", "node-operations-concurrent",
        "--id", concurrentCharlieId,
      ], { artifactName: "concurrent-blacklist-charlie" }),
      meadowCli.runJson<MutateBundleNodeCliResult>([
        "bundle", "node", "set-depths", "node-operations-concurrent",
        "--id", concurrentWarrenId, "--outlinks", "1", "--inlinks", "0",
      ], { artifactName: "concurrent-set-warren-depths" }),
    ]);
    const [concurrentCharlieState, concurrentWarrenState] = await Promise.all([
      meadowCli.runJson<DescribeBundleNodeCliResult>([
        "bundle", "node", "describe", "node-operations-concurrent",
        "--id", concurrentCharlieId,
      ], { artifactName: "describe-concurrent-charlie" }),
      meadowCli.runJson<DescribeBundleNodeCliResult>([
        "bundle", "node", "describe", "node-operations-concurrent",
        "--id", concurrentWarrenId,
      ], { artifactName: "describe-concurrent-warren" }),
    ]);
    expect(concurrentCharlieState.node).toMatchObject({ tracked: true, blacklisted: true });
    expect(concurrentWarrenState.node.config).toMatchObject({ outlinksDepth: 1, inlinksDepth: 0 });

    const found = await meadowCli.runJson<FindBundleNodeCliResult>([
      "bundle", "node", "find-in-bundles", "notable-mental-models", "--id", nodeId,
    ], { artifactName: "find-charlie-in-bundles" });
    expect(found.bundles.map(bundle => ({ slug: bundle.slug, blacklisted: bundle.blacklisted }))).toEqual([
      { slug: "node-operations-concurrent", blacklisted: true },
      { slug: "node-operations-copy", blacklisted: false },
      { slug: "notable-mental-models", blacklisted: false },
    ]);

    const depths = await meadowCli.runJson<MutateBundleNodeCliResult>([
      "bundle", "node", "set-depths", "notable-mental-models", "--id", nodeId,
      "--outlinks", "5", "--inlinks", "2",
    ], { artifactName: "set-charlie-depths" });
    expect(depths).toMatchObject({
      operation: "bundle.node.set-depths",
      changed: true,
      node: { config: { outlinksDepth: 5, inlinksDepth: 2 } },
    });

    const inheritedDepths = await meadowCli.runJson<MutateBundleNodeCliResult>([
      "bundle", "node", "set-depths", "notable-mental-models", "--id", nodeId,
      "--outlinks", "inherit", "--inlinks", "inherit",
    ], { artifactName: "clear-charlie-depths" });
    expect(inheritedDepths.changed).toBe(true);
    expect(inheritedDepths.node.config).not.toHaveProperty("outlinksDepth");
    expect(inheritedDepths.node.config).not.toHaveProperty("inlinksDepth");

    const blacklisted = await meadowCli.runJson<MutateBundleNodeCliResult>([
      "bundle", "node", "blacklist", "notable-mental-models", "--id", nodeId,
    ], { artifactName: "blacklist-charlie" });
    expect(blacklisted).toMatchObject({ changed: true, node: { tracked: true, blacklisted: true } });

    const unblacklisted = await meadowCli.runJson<MutateBundleNodeCliResult>([
      "bundle", "node", "unblacklist", "notable-mental-models", "--id", nodeId,
    ], { artifactName: "unblacklist-charlie" });
    expect(unblacklisted).toMatchObject({ changed: true, node: { tracked: true, blacklisted: false } });

    const sensitive = await meadowCli.runJson<MutateBundleNodeCliResult>([
      "bundle", "node", "mark-sensitive", "notable-mental-models", "--id", nodeId,
    ], { artifactName: "mark-charlie-sensitive" });
    expect(sensitive).toMatchObject({ changed: true, node: { sensitive: true } });

    const notSensitive = await meadowCli.runJson<MutateBundleNodeCliResult>([
      "bundle", "node", "mark-not-sensitive", "notable-mental-models",
      "--path", "Charlie Munger.md",
    ], { artifactName: "mark-charlie-not-sensitive" });
    expect(notSensitive).toMatchObject({ changed: true, node: { sensitive: false } });

    const untracked = await meadowCli.runJson<MutateBundleNodeCliResult>([
      "bundle", "node", "untrack", "notable-mental-models", "--id", nodeId,
    ], { artifactName: "untrack-charlie-by-id" });
    expect(untracked).toMatchObject({ changed: true, node: { tracked: false } });
    expect(untracked.node.bundleNodeId).toBeUndefined();

    const untrackedAgain = await meadowCli.runJson<MutateBundleNodeCliResult>([
      "bundle", "node", "untrack", "notable-mental-models",
      "--path", "Charlie Munger.md",
    ], { artifactName: "retry-untrack-charlie-by-path" });
    expect(untrackedAgain.changed).toBe(false);

    const help = await meadowCli.run(
      ["bundle", "node", "--help"],
      { artifactName: "single-node-help" },
    );
    expect(help).toContain("Preferred stable ID returned after a node is tracked");
    expect(help).toContain("--outlinks <depth|inherit>");
    expect(help).toContain("find-in-bundles");
    void cli;
    void bundles;
    await assertMeadowHomeState();
  } finally {
    source.cleanup();
  }
});
