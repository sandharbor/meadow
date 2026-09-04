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

import fs from "fs";
import path from "path";
import { cli, versioning } from "../../../concepts/index.js";
import { expect, test } from "../src/run/test-fixtures.js";
import { Bundle } from "../src/run/workflows.js";

interface VersionRecord {
  versionId: string;
  notes: string;
  localFilesState: "present" | "deleted";
  displayState: string;
}

interface VersionListResult {
  operation: "bundle.versions.list";
  slug: string;
  versions: VersionRecord[];
}

function findGeneratedHtmlFile(directory: string): string {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findGeneratedHtmlFile(candidate);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      return candidate;
    }
  }
  return "";
}

test.use({ bundleMode: "single-file" });
test.use({ executionSurface: "cli" });
test.use({ recordVideo: false });

test("CLI manages generated versions through create read update restore cancel and delete", async ({
  assertMeadowHomeState,
  meadowCli,
  testServer,
}) => {
  const generated = await meadowCli.runJson<{ versionId: string }>([
    "bundle", "generate", Bundle.Big,
  ], { artifactName: "versions-generate-initial" });
  await meadowCli.runJson([
    "bundle", "save-generation", Bundle.Big, "--version", generated.versionId,
  ], { artifactName: "versions-save-initial" });
  const initial = await meadowCli.runJson<VersionListResult>([
    "bundle", "versions", "list", Bundle.Big,
  ], { artifactName: "versions-list-initial" });
  expect(initial).toMatchObject({ operation: "bundle.versions.list", slug: Bundle.Big });
  expect(initial.versions).toHaveLength(1);
  const originalVersionId = initial.versions[0].versionId;
  expect(originalVersionId).toBe(generated.versionId);

  const updated = await meadowCli.runJson<{ operation: string; notes: string }>([
    "bundle", "versions", "update", Bundle.Big, originalVersionId,
    "--notes", "Original CLI-managed generation",
  ], { artifactName: "versions-update-note" });
  expect(updated).toMatchObject({
    operation: "bundle.versions.update",
    notes: "Original CLI-managed generation",
  });
  const original = await meadowCli.runJson<{ operation: string; version: VersionRecord }>([
    "bundle", "versions", "get", Bundle.Big, originalVersionId,
  ], { artifactName: "versions-get-original" });
  expect(original.version).toMatchObject({
    versionId: originalVersionId,
    notes: "Original CLI-managed generation",
    localFilesState: "present",
  });

  const firstSuccessor = await meadowCli.runJson<{ operation: string; versionId: string }>([
    "bundle", "versions", "create", Bundle.Big,
    "--notes", "Disposable successor",
    "--confirm-no-changes",
  ], { artifactName: "versions-create-disposable" });
  expect(firstSuccessor.operation).toBe("bundle.versions.create");
  expect(firstSuccessor.versionId).not.toBe(originalVersionId);
  const cancelled = await meadowCli.runJson<{ operation: string; currentVersionId: string }>([
    "bundle", "versions", "cancel-current", Bundle.Big,
  ], { artifactName: "versions-cancel-current" });
  expect(cancelled).toMatchObject({
    operation: "bundle.versions.cancel-current",
    currentVersionId: originalVersionId,
  });

  const successor = await meadowCli.runJson<{ operation: string; versionId: string }>([
    "bundle", "versions", "create", Bundle.Big,
    "--notes", "Durable CLI successor",
    "--confirm-no-changes",
  ], { artifactName: "versions-create-successor" });
  await meadowCli.runJson([
    "bundle", "save-generation", Bundle.Big, "--version", successor.versionId,
  ], { artifactName: "versions-save-successor" });

  const frozenVersionDirectory = path.join(
    testServer.configDir,
    "bundles",
    Bundle.Big,
    "html",
    "generated_bundle_versions",
    originalVersionId,
  );
  const frozenIndexPath = findGeneratedHtmlFile(frozenVersionDirectory);
  expect(frozenIndexPath).not.toBe("");
  const frozenIndex = fs.readFileSync(frozenIndexPath, "utf8");
  fs.appendFileSync(frozenIndexPath, "\n<!-- simulated accidental edit -->\n", "utf8");
  const restored = await meadowCli.runJson<{ operation: string; success: boolean }>([
    "bundle", "versions", "restore", Bundle.Big, originalVersionId,
  ], { artifactName: "versions-restore-frozen" });
  expect(restored).toMatchObject({ operation: "bundle.versions.restore", success: true });
  expect(fs.readFileSync(frozenIndexPath, "utf8")).toBe(frozenIndex);

  const deleted = await meadowCli.runJson<{ operation: string; success: boolean }>([
    "bundle", "versions", "delete", Bundle.Big, originalVersionId,
  ], { artifactName: "versions-delete-frozen" });
  expect(deleted).toMatchObject({ operation: "bundle.versions.delete", success: true });
  const tombstone = await meadowCli.runJson<{ version: VersionRecord }>([
    "bundle", "versions", "get", Bundle.Big, originalVersionId,
  ], { artifactName: "versions-get-tombstone" });
  expect(tombstone.version).toMatchObject({
    versionId: originalVersionId,
    localFilesState: "deleted",
    displayState: "locally-deleted",
  });
  expect(fs.existsSync(frozenVersionDirectory)).toBe(false);

  const help = await meadowCli.run(
    ["bundle", "versions", "--help"],
    { artifactName: "versions-help" },
  );
  expect(help).toContain("Create a new unsaved version");
  expect(help).toContain("cancel-current");
  expect(help).toContain("Local deletion never deletes publication records");
  void cli;
  void versioning;
  await assertMeadowHomeState();
});
