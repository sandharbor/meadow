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
import { test, expect } from "../src/run/test-fixtures.js";
import { PreviewPublishModal } from "../src/run/pages/index.js";
import { Bundle, Workflows } from "../src/run/workflows.js";

test.use({ bundleMode: "single-file" });

function recursiveFiles(directory: string): string[] {
  return fs.readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter(relativePath => fs.statSync(path.join(directory, relativePath)).isFile());
}

test("D01 E01 E02 E03 selected and All Versions exports enforce saved and tombstone boundaries", async ({
  page,
  artifactDir,
  snapshot,
  skipMeadowHomeStateCheck,
  testServer,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundleShareTab();
  const bundleApi = `/api/bundles/${encodeURIComponent(Bundle.Big)}`;

  const firstState = await page.request.get(`${bundleApi}/review/versions`);
  const firstVersionId = ((await firstState.json()) as { versions: Array<{ versionId: string }> }).versions[0].versionId;
  const createResponse = await page.request.post(`${bundleApi}/generation/versions`, {
    data: {
      notes: "private editorial note that must never be exported",
      confirmedNoGeneratedChanges: true,
    },
  });
  expect(createResponse.ok()).toBe(true);
  const secondVersionId = ((await createResponse.json()) as { versionId: string }).versionId;
  const saveResponse = await page.request.get(`${bundleApi}/review/save-changes`);
  expect(saveResponse.ok()).toBe(true);

  // Reopen the modal so the common selector and Local Export tab see both versions.
  await wf.navigateToBigBundleShareTab();
  const modal = new PreviewPublishModal(page, expect);
  await page.getByRole("button", { name: "Local Export" }).click();
  await expect(page.getByText("All Versions (Rendered Bundle only)", { exact: true })).toBeVisible();
  await modal.expectShareVersionSelected(secondVersionId);
  await snapshot("local export offers the selected saved version and All Versions");

  const exportTo = async (destinationPath: string, body: Record<string, unknown>) => {
    fs.mkdirSync(destinationPath, { recursive: true });
    return page.request.post(`${bundleApi}/sharing/copy-to-directory`, {
      data: { sourceType: "html", destinationPath, ...body },
    });
  };

  const selectedDirectory = path.join(artifactDir, "selected-version-export");
  const selectedResponse = await exportTo(selectedDirectory, { versionId: firstVersionId });
  expect(selectedResponse.ok()).toBe(true);
  expect(recursiveFiles(selectedDirectory).some(file => file.endsWith(".html"))).toBe(true);
  expect(fs.existsSync(path.join(selectedDirectory, `${Bundle.Big}-${firstVersionId}`))).toBe(false);

  const allDirectory = path.join(artifactDir, "all-versions-export");
  const allResponse = await exportTo(allDirectory, { allVersions: true });
  expect(allResponse.ok()).toBe(true);
  expect(fs.existsSync(path.join(allDirectory, `${Bundle.Big}-${firstVersionId}`))).toBe(true);
  expect(fs.existsSync(path.join(allDirectory, `${Bundle.Big}-${secondVersionId}`))).toBe(true);
  const allManifestPath = path.join(allDirectory, `${Bundle.Big}-versions.json`);
  const allManifestText = fs.readFileSync(allManifestPath, "utf8");
  expect(allManifestText).not.toContain("private editorial note");
  expect(allManifestText).not.toContain(testServer.sourceGraphsDir);

  // Dirty current blocks current and All Versions, while the frozen version remains exportable.
  const currentDirectory = path.join(
    testServer.configDir,
    "bundles",
    Bundle.Big,
    "html",
    "generated_bundle_versions",
    secondVersionId,
  );
  const currentHtml = recursiveFiles(currentDirectory).find(file => file.endsWith(".html"));
  expect(currentHtml).toBeTruthy();
  const currentHtmlPath = path.join(currentDirectory, currentHtml!);
  const savedBytes = fs.readFileSync(currentHtmlPath);
  fs.appendFileSync(currentHtmlPath, "\n<!-- dirty current -->\n");

  expect((await exportTo(path.join(artifactDir, "dirty-current-export"), { versionId: secondVersionId })).status()).toBe(409);
  expect((await exportTo(path.join(artifactDir, "dirty-all-export"), { allVersions: true })).status()).toBe(409);
  expect((await exportTo(path.join(artifactDir, "frozen-while-current-dirty"), { versionId: firstVersionId })).ok()).toBe(true);

  // Restore current bytes, tombstone the frozen local files, and prove the
  // inventory retains the identity without creating a misleading directory.
  fs.writeFileSync(currentHtmlPath, savedBytes);
  const deleteLocalResponse = await page.request.delete(`${bundleApi}/review/versions/${firstVersionId}`);
  expect(deleteLocalResponse.ok()).toBe(true);
  const tombstoneDirectory = path.join(artifactDir, "all-versions-with-tombstone");
  expect((await exportTo(tombstoneDirectory, { allVersions: true })).ok()).toBe(true);
  const tombstoneManifest = JSON.parse(
    fs.readFileSync(path.join(tombstoneDirectory, `${Bundle.Big}-versions.json`), "utf8"),
  ) as { versions: Array<{ versionId: string; localFilesState: string }> };
  expect(tombstoneManifest.versions).toContainEqual({ versionId: firstVersionId, localFilesState: "deleted" });
  expect(fs.existsSync(path.join(tombstoneDirectory, `${Bundle.Big}-${firstVersionId}`))).toBe(false);
  expect(fs.existsSync(path.join(tombstoneDirectory, `${Bundle.Big}-${secondVersionId}`))).toBe(true);

  await modal.clickStep1Review();
  await modal.clickVersionsTab();
  await expect(page.getByText("Locally Deleted", { exact: true })).toBeVisible();
  await snapshot("local tombstone retained in version history");

  await skipMeadowHomeStateCheck();
});
