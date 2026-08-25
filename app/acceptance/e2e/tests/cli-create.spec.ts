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

import { readFileSync, readdirSync } from "fs";
import path from "path";
import YAML from "yaml";
import type {
  CreateBundleCliResult,
  GenerateBundleCliResult,
  SaveGenerationCliResult,
  TrackBundleNodesCliResult,
} from "../../../contracts/types/cliOperations.js";
import type { GraphDescription } from "../../../contracts/types/graphInspection.js";
import {
  EXPECTED_GENERATED_CONTENT_ASSETS,
  EXPECTED_GENERATED_PAGES,
  materializeCreateSafeBundleSource,
} from "../src/agent-evals/scenarios/createSafeBundle.js";
import { bundles } from "../src/app-area-docs/index.js";
import { cli } from "../src/scenario-docs/index.js";
import { expect, test } from "../src/run/test-fixtures.js";

function listRelativeFiles(directory: string): string[] {
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else files.push(path.relative(directory, entryPath).split(path.sep).join("/"));
    }
  };
  visit(directory);
  return files.sort();
}

test.use({ bundleMode: "single-file" });
test.use({ executionSurface: "cli" });
test.use({ fixtureHome: "none" });
test.use({ recordVideo: false });

test("CLI creates a page bundle and safely tracks its working graph", async ({
  assertMeadowHomeState,
  meadowCli,
  page,
  testServer,
}) => {
  const source = materializeCreateSafeBundleSource({ readOnly: true });
  try {
    const created = await meadowCli.runJson<CreateBundleCliResult>([
      "bundles",
      "create",
      "--source",
      source.directory,
      "--entry",
      "Notable Mental Models.md",
    ], { artifactName: "create-notable-mental-models" });
    expect(created).toMatchObject({
      schemaVersion: 1,
      operation: "bundles.create",
      slug: "notable-mental-models",
      created: true,
      changed: true,
      mutationBehavior: {
        atomicity: "atomic",
        idempotency: "conditional",
        staleWrite: "not-applicable",
      },
      sourceDirectory: source.directory,
      entryPage: "Notable Mental Models.md",
      entryPageTracked: true,
      defaults: { outlinksDepth: 3, inlinksDepth: 1 },
    });
    expect(created.nextActions?.[0]).toEqual({
      operation: "track-safe-nodes",
      args: ["bundle", "track", "notable-mental-models", "--all-safe"],
      displayCommand: "meadow bundle track notable-mental-models --all-safe",
    });

    const retried = await meadowCli.runJson<CreateBundleCliResult>([
      "bundles",
      "create",
      "--source",
      source.directory,
      "--entry",
      "Notable Mental Models.md",
    ], { artifactName: "retry-create-notable-mental-models" });
    expect(retried).toMatchObject({
      slug: "notable-mental-models",
      created: false,
      changed: false,
    });

    const conflict = await meadowCli.runFailure([
      "bundles",
      "create",
      "--source",
      source.directory,
      "--entry",
      "Notable Mental Models.md",
      "--slug",
      "notable-mental-models",
    ], { artifactName: "reject-conflicting-explicit-slug" });
    expect(conflict.exitCode).toBe(1);
    expect(conflict.stdout).toBe("");
    expect(conflict.stderr).toContain("Bundle slug 'notable-mental-models' already exists");
    expect(conflict.stderr).toContain("Choose a different --slug");

    const trackedSafe = await meadowCli.runJson<TrackBundleNodesCliResult>([
      "bundle",
      "track",
      "notable-mental-models",
      "--all-safe",
    ], { artifactName: "track-all-safe" });
    expect(trackedSafe).toMatchObject({
      schemaVersion: 1,
      operation: "bundle.track",
      slug: "notable-mental-models",
      mode: "all-safe",
      changed: true,
      mutationBehavior: {
        atomicity: "atomic",
        idempotency: "idempotent",
        staleWrite: "rejects-stale",
      },
    });
    expect(trackedSafe.newlyTracked).toHaveLength(31);
    expect(trackedSafe.alreadyTracked.map(node => node.bundleNodeName)).toEqual([
      "Notable Mental Models",
    ]);
    expect(trackedSafe.sensitiveSkipped.map(node => node.bundleNodeName).sort()).toEqual([
      "2026-02-02",
      "2026-02-10",
      "Thoughts on Munger's Investment Portfolio",
    ]);
    expect(trackedSafe.newlyTracked.map(node => node.bundleNodeName)).toContain("2025 taxes");
    expect(trackedSafe.newlyTracked.every(node => /^[a-z0-9]{12}$/.test(node.bundleNodeId))).toBe(true);
    expect(trackedSafe.nextActions?.[0]).toEqual({
      operation: "generate-bundle",
      args: ["bundle", "generate", "notable-mental-models"],
      displayCommand: "meadow bundle generate notable-mental-models",
    });

    const retriedSafe = await meadowCli.runJson<TrackBundleNodesCliResult>([
      "bundle",
      "track",
      "notable-mental-models",
      "--all-safe",
    ], { artifactName: "retry-track-all-safe" });
    expect(retriedSafe.changed).toBe(false);
    expect(retriedSafe.newlyTracked).toEqual([]);
    expect(retriedSafe.alreadyTracked).toHaveLength(32);
    expect(retriedSafe.sensitiveSkipped).toHaveLength(3);

    const generated = await meadowCli.runJson<GenerateBundleCliResult>([
      "bundle",
      "generate",
      "notable-mental-models",
    ], { artifactName: "generate-bundle" });
    expect(generated).toMatchObject({
      schemaVersion: 1,
      operation: "bundle.generate",
      slug: "notable-mental-models",
      changed: true,
      mutationBehavior: {
        atomicity: "atomic",
        idempotency: "conditional",
        staleWrite: "current-state-preflight",
      },
      saved: false,
      versionId: expect.stringMatching(/^v[A-Za-z0-9]{6}$/),
      previewUrl: expect.stringMatching(/^http:\/\/127\.0\.0\.1:/),
    });
    expect(generated.previewUrl).not.toContain(testServer.configDir);
    expect(generated.nextActions?.[0]).toEqual({
      operation: "save-generation",
      args: [
        "bundle",
        "save-generation",
        "notable-mental-models",
        "--version",
        generated.versionId,
      ],
      displayCommand: `meadow bundle save-generation notable-mental-models --version ${generated.versionId}`,
    });
    const previewResponse = await page.goto(generated.previewUrl);
    expect(previewResponse?.ok()).toBe(true);
    await expect(page.getByRole("heading", { name: "Notable Mental Models", exact: true })).toBeVisible();

    const regenerated = await meadowCli.runJson<GenerateBundleCliResult>([
      "bundle",
      "generate",
      "notable-mental-models",
    ], { artifactName: "retry-generate-bundle" });
    expect(regenerated.versionId).toBe(generated.versionId);
    expect(regenerated.saved).toBe(false);

    const staleSave = await meadowCli.runFailure([
      "bundle",
      "save-generation",
      "notable-mental-models",
      "--version",
      "vAAAAAA",
    ], { artifactName: "refuse-stale-version-save" });
    expect(staleSave.stderr).toContain("is not the current generated version");
    expect(staleSave.stderr).toContain(`Save ${generated.versionId}`);

    const saved = await meadowCli.runJson<SaveGenerationCliResult>([
      "bundle",
      "save-generation",
      "notable-mental-models",
      "--version",
      generated.versionId,
    ], { artifactName: "save-generation" });
    expect(saved).toMatchObject({
      schemaVersion: 1,
      operation: "bundle.save-generation",
      slug: "notable-mental-models",
      changed: true,
      mutationBehavior: {
        atomicity: "atomic",
        idempotency: "idempotent",
        staleWrite: "rejects-stale",
      },
      versionId: generated.versionId,
      saved: true,
      savedGenerationId: expect.stringMatching(/^[0-9a-f]{40,64}$/),
    });
    const savedAgain = await meadowCli.runJson<SaveGenerationCliResult>([
      "bundle",
      "save-generation",
      "notable-mental-models",
      "--version",
      generated.versionId,
    ], { artifactName: "retry-save-generation" });
    expect(savedAgain).toMatchObject({
      changed: false,
      versionId: generated.versionId,
      savedGenerationId: saved.savedGenerationId,
    });

    const generatedFiles = listRelativeFiles(path.join(
      testServer.configDir,
      `bundles/notable-mental-models/html/generated_bundle_versions/${generated.versionId}`,
    ));
    expect(generatedFiles.filter(file => !file.includes("/"))).toEqual(EXPECTED_GENERATED_PAGES);
    for (const asset of EXPECTED_GENERATED_CONTENT_ASSETS) expect(generatedFiles).toContain(asset);
    expect(generatedFiles.some(file => file.toLowerCase().includes("2025 taxes"))).toBe(false);
    expect(generatedFiles.some(file => file.includes("2026-02-02"))).toBe(false);
    expect(generatedFiles.some(file => file.includes("2026-02-10"))).toBe(false);
    expect(generatedFiles.some(file => file.toLowerCase().includes("thoughts on munger"))).toBe(false);

    const explicitDuplicate = await meadowCli.runJson<CreateBundleCliResult>([
      "bundles",
      "create",
      "--source",
      source.directory,
      "--entry",
      "Notable Mental Models.md",
      "--slug",
      "notable-mental-models-copy",
    ], { artifactName: "create-explicit-duplicate" });
    expect(explicitDuplicate).toMatchObject({
      slug: "notable-mental-models-copy",
      created: true,
      changed: true,
    });

    const copyGraph = await meadowCli.runJson<GraphDescription>([
      "bundle",
      "nodes",
      "notable-mental-models-copy",
      "--scope",
      "all",
    ], { artifactName: "inspect-copy-node-keys" });
    const keyFor = (name: string): string => {
      const node = copyGraph.nodes.find(candidate => candidate.bundleNodeName === name);
      expect(node, `Expected ${name} in the working graph`).toBeDefined();
      return node!.bundleNodeKey;
    };
    const targeted = await meadowCli.runJson<TrackBundleNodesCliResult>([
      "bundle",
      "track",
      "notable-mental-models-copy",
      "--node-key",
      keyFor("Charlie Munger"),
      "--node-key",
      keyFor("Warren Buffett"),
    ], { artifactName: "targeted-track-repeatable-node-key" });
    expect(targeted).toMatchObject({
      mode: "targeted",
      changed: true,
    });
    expect(targeted.newlyTracked.map(node => node.bundleNodeName).sort()).toEqual([
      "Charlie Munger",
      "Warren Buffett",
    ]);

    const sensitiveRefusal = await meadowCli.runFailure([
      "bundle",
      "track",
      "notable-mental-models-copy",
      "--node-key",
      keyFor("2026-02-02"),
    ], { artifactName: "targeted-track-refuses-sensitive" });
    expect(sensitiveRefusal.stderr).toContain("Refusing to track sensitive node");
    expect(sensitiveRefusal.stderr).toContain("No sensitive-content override is available");

    const bundleConfig = YAML.parse(readFileSync(
      path.join(testServer.configDir, "bundles/notable-mental-models/config/bundle_config.yaml"),
      "utf8",
    )) as Record<string, unknown>;
    expect(bundleConfig).toMatchObject({
      sourceDirectory: source.directory,
      defaultOutlinksDepth: 3,
      defaultInlinksDepth: 1,
    });
    const nodeConfig = YAML.parse(readFileSync(
      path.join(testServer.configDir, "bundles/notable-mental-models/config/bundle_node_config.yaml"),
      "utf8",
    )) as { nodes: Array<Record<string, unknown>> };
    expect(nodeConfig.nodes).toHaveLength(32);
    const entryNode = nodeConfig.nodes.find(node => node.bundleNodeName === "Notable Mental Models");
    expect(entryNode).toMatchObject({
      bundleNodeName: "Notable Mental Models",
      bundleNodeKind: "file",
      fileType: "md",
      listType: "whitelist",
    });
    expect(bundleConfig.entryBundleNodeId).toBe(entryNode?.bundleNodeId);
    expect(bundleConfig.defaultTraversalBundleNodeId).toBe(entryNode?.bundleNodeId);
    const trackedContentDirectory = path.join(
      testServer.configDir,
      "bundles/notable-mental-models/raw/tracked_page_content",
    );
    expect(readFileSync(path.join(trackedContentDirectory, "2025 taxes.md"), "utf8")).toContain("Tax preparation");
    expect(() => readFileSync(path.join(trackedContentDirectory, "2026-02-02.md"), "utf8")).toThrow();
    expect(() => readFileSync(
      path.join(trackedContentDirectory, "Thoughts on Munger's Investment Portfolio.md"),
      "utf8",
    )).toThrow();

    const topHelp = await meadowCli.run(["--help"], { artifactName: "top-level-create-help" });
    expect(topHelp).toContain("meadow bundles create --source <directory> --entry <relative-page>");
    expect(topHelp).toContain("meadow bundle node track <bundle-slug> --path <node-path>");
    const createHelp = await meadowCli.run(
      ["bundles", "create", "--help"],
      { artifactName: "nested-create-help" },
    );
    expect(createHelp).toContain("Implicit creation is safe to retry");
    expect(createHelp).toContain("The entry page is tracked automatically");
    expect(createHelp).toContain("--slug <slug>");
    const trackHelp = await meadowCli.run(
      ["bundle", "track", "--help"],
      { artifactName: "nested-track-help" },
    );
    expect(trackHelp).toContain("--all-safe");
    expect(trackHelp).toContain("--node-key <bundle-node-key>");
    expect(trackHelp).toContain("For explicit one-at-a-time curation");
    expect(trackHelp).toContain("It never tracks sensitive nodes");
    const nodeHelp = await meadowCli.run(
      ["bundle", "node", "--help"],
      { artifactName: "nested-node-help" },
    );
    expect(nodeHelp).toContain('meadow bundle node track my-site --path "Charlie Munger.md"');
    expect(nodeHelp).toContain("bundle node set-depths");
    const nodeHelpAlias = await meadowCli.run(
      ["help", "bundle", "node"],
      { artifactName: "nested-node-help-alias" },
    );
    expect(nodeHelpAlias).toBe(nodeHelp);
    const generateHelp = await meadowCli.run(
      ["bundle", "generate", "--help"],
      { artifactName: "nested-generate-help" },
    );
    expect(generateHelp).toContain("bundle-scoped read-only previewUrl");
    const generateHelpAlias = await meadowCli.run(
      ["help", "bundle", "generate"],
      { artifactName: "nested-generate-help-alias" },
    );
    expect(generateHelpAlias).toBe(generateHelp);
    const saveHelp = await meadowCli.run(
      ["bundle", "save-generation", "--help"],
      { artifactName: "nested-save-generation-help" },
    );
    expect(saveHelp).toContain("savedGenerationId");
    expect(saveHelp).toContain("safe to retry");
    void cli;
    void bundles;

    await assertMeadowHomeState();
  } finally {
    source.cleanup();
  }
});
