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

import {
  E2E_S3_ACCESS_KEY_ID,
  E2E_S3_SECRET_ACCESS_KEY,
  test,
  expect,
} from "../src/run/test-fixtures.js";
import fs from "fs";
import path from "path";
import { PreviewPublishModal, PublishToS3Tab, PublishedBundlePage } from "../src/run/pages/index.js";
import { Workflows, Bundle } from "../src/run/workflows.js";
import { publishing, s3, deletion } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("R02 R04 R05 R06 R07 R08 P02 P06 D02 L01 S3 version publication and reader awareness lifecycle", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  artifactDir,
  minioS3,
  testServer,
}) => {
  // Swap the active provider to S3PublishingProvider before the frontend
  // fetches /api/sharing/publishing-providers.
  await testServer.activateS3Provider();

  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundleShareTab();

  const publishPage = new PublishToS3Tab(page, expect);
  await publishPage.expectVisible();

  await expect(page.getByTestId('s3-config-summary')).toContainText('credentials saved');
  await page.getByTestId('s3-config-toggle').click();
  await expect(page.getByTestId('s3-access-key-id')).toHaveValue('••••••••');
  await expect(page.getByTestId('s3-secret-access-key')).toHaveValue('••••••••••••••••');
  await expect(page.getByText(/saved values cannot be shown/i)).toBeVisible();
  expect(await page.content()).not.toContain(E2E_S3_ACCESS_KEY_ID);
  expect(await page.content()).not.toContain(E2E_S3_SECRET_ACCESS_KEY);
  await snapshot('saved S3 credentials represented only by presence');
  await page.getByTestId('s3-secret-access-key').scrollIntoViewIfNeeded();
  await addKeyFrame(s3);
  await page.getByTestId('s3-config-toggle').click();

  const publishSlug = `${Bundle.Big}-s3`;
  await publishPage.setPublishSlug(publishSlug);
  await snapshot("S3 publish slug saved");

  await minioS3.expectEmpty(`${publishSlug}-`);

  await publishPage.clickPublish();
  const publishedUrl = await publishPage.expectPublishSuccess();
  await publishPage.expectNoError();
  await addKeyFrame(publishing);
  await addKeyFrame(s3);
  await snapshot("S3 publish succeeded");

  expect(publishedUrl.startsWith("http://localhost")).toBe(true);
  const versionMatch = publishedUrl.match(new RegExp(`/${publishSlug}-(v[A-Za-z0-9]{6})/`));
  expect(versionMatch).not.toBeNull();
  const versionId = versionMatch![1];
  const versionNamespace = `${publishSlug}-${versionId}`;

  await minioS3.expectHasFiles(`${versionNamespace}/`);
  await minioS3.expectHasHtmlFiles(`${versionNamespace}/`);
  const successorManifestKey = `${publishSlug}-versions.json`;
  expect(await minioS3.listKeys(successorManifestKey)).toEqual([successorManifestKey]);
  expect(JSON.parse(await minioS3.getObjectContent(successorManifestKey))).toEqual({
    schemaVersion: 1,
    successors: {},
  });

  // The same saved generation is an explicit republish, with append-only history.
  await publishPage.expectPublishButtonLabel("Republish");
  await publishPage.clickPublish();
  expect(await publishPage.expectPublishSuccess()).toBe(publishedUrl);
  const providerApi = `/api/sharing/publishing-providers/S3PublishingProvider/bundles/${encodeURIComponent(Bundle.Big)}`;
  const publicationStateResponse = await page.request.get(`${providerApi}/publication-state?versionId=${versionId}`);
  expect(publicationStateResponse.ok()).toBe(true);
  const publicationState = await publicationStateResponse.json() as {
    status: { kind: string };
    events: Array<{ eventType: string; versionId: string }>;
  };
  expect(publicationState.status.kind).toBe("published-current");
  expect(publicationState.events.map(event => event.eventType)).toEqual([
    "publication-success",
    "republish-success",
  ]);

  const lockedDestinationResponse = await page.request.put(`${providerApi}/provider-config`, {
    data: { publishSlug: `${publishSlug}-changed` },
  });
  expect(lockedDestinationResponse.status()).toBe(409);

  const publishedBundle = new PublishedBundlePage(page, expect);
  await publishedBundle.goto(publishedUrl);
  await publishedBundle.expectMainHeadingVisible();
  await publishedBundle.expectNoNewerVersionNotice();
  await snapshot("browsed S3-published bundle");

  // Create and save a connected successor, then publish it to the same destination.
  const createSuccessorResponse = await page.request.post(
    `/api/bundles/${encodeURIComponent(Bundle.Big)}/generation/versions`,
    { data: { notes: "Connected reader successor", confirmedNoGeneratedChanges: true } },
  );
  expect(createSuccessorResponse.ok()).toBe(true);
  const successorVersionId = (await createSuccessorResponse.json() as { versionId: string }).versionId;
  const saveSuccessorResponse = await page.request.get(`/api/bundles/${encodeURIComponent(Bundle.Big)}/review/save-changes`);
  expect(saveSuccessorResponse.ok()).toBe(true);
  const publishSuccessorResponse = await page.request.post(`${providerApi}/publish`, {
    data: { versionId: successorVersionId },
  });
  expect(publishSuccessorResponse.ok()).toBe(true);
  const successorUrl = (await publishSuccessorResponse.json() as { publishedUrl: string }).publishedUrl;
  const successorNamespace = `${publishSlug}-${successorVersionId}`;
  await minioS3.expectHasHtmlFiles(`${successorNamespace}/`);
  const successorManifest = JSON.parse(await minioS3.getObjectContent(successorManifestKey)) as {
    successors: Record<string, { versionId: string; versionRoot: string; entryPath: string }>;
  };
  expect(successorManifest.successors[versionId]).toMatchObject({
    versionId: successorVersionId,
    versionRoot: successorNamespace,
  });

  await publishedBundle.goto(publishedUrl);
  await publishedBundle.expectNewerPageLink(successorUrl);
  await snapshot("older page links to its connected successor");

  // Remove the stable identity from the successor route index: the old page
  // must offer only the successor entry page, never a nonexistent equivalent.
  const successorRouteKey = (await minioS3.listKeys(`${successorNamespace}/_mw_assets/versioning/routes.`))[0];
  expect(successorRouteKey).toBeTruthy();
  const routeIndex = JSON.parse(await minioS3.getObjectContent(successorRouteKey)) as {
    schemaVersion: 1;
    entryPath: string;
    routesByBundleNodeId: Record<string, string>;
    generatedPagePaths: string[];
  };
  const stableEntry = Object.entries(routeIndex.routesByBundleNodeId)
    .find(([, generatedPath]) => generatedPath === routeIndex.entryPath);
  expect(stableEntry).toBeTruthy();
  const movedPath = "moved-reader-entry.html";
  await minioS3.putObjectContent(
    `${successorNamespace}/${movedPath}`,
    await minioS3.getObjectContent(`${successorNamespace}/${routeIndex.entryPath}`),
    "text/html",
  );
  await minioS3.putObjectContent(successorRouteKey, JSON.stringify({
    ...routeIndex,
    routesByBundleNodeId: {
      ...routeIndex.routesByBundleNodeId,
      [stableEntry![0]]: movedPath,
    },
    generatedPagePaths: [...routeIndex.generatedPagePaths, movedPath],
  }));
  const movedUrl = new URL(movedPath, successorUrl).toString();
  await publishedBundle.goto(publishedUrl);
  await publishedBundle.expectNewerPageLink(movedUrl);
  await snapshot("stable page identity follows a moved successor route");

  await minioS3.putObjectContent(successorRouteKey, JSON.stringify({
    ...routeIndex,
    routesByBundleNodeId: {},
  }));
  await publishedBundle.goto(publishedUrl);
  await publishedBundle.expectMissingPageNotice(successorUrl);
  await snapshot("missing-page reader callout links only to successor entry");
  await page.screenshot({
    path: path.join(artifactDir, "missing-page-reader-callout.png"),
    fullPage: true,
  });

  // Lookup failures are deliberately silent and recover when the destination
  // manifest becomes readable again.
  await minioS3.putObjectContent(successorManifestKey, "{invalid-json");
  await publishedBundle.goto(publishedUrl);
  await publishedBundle.expectNoNewerVersionNotice();
  await minioS3.putObjectContent(successorManifestKey, JSON.stringify(successorManifest));

  // A published but disconnected third version must not notify the second
  // lineage even though it is later in manifest order.
  const createDisconnectedResponse = await page.request.post(
    `/api/bundles/${encodeURIComponent(Bundle.Big)}/generation/versions`,
    {
      data: {
        notes: "Disconnected reader release",
        readerConnectionToPredecessor: "disconnected",
        confirmedNoGeneratedChanges: true,
      },
    },
  );
  expect(createDisconnectedResponse.ok()).toBe(true);
  const disconnectedVersionId = (await createDisconnectedResponse.json() as { versionId: string }).versionId;
  expect((await page.request.get(`/api/bundles/${encodeURIComponent(Bundle.Big)}/review/save-changes`)).ok()).toBe(true);
  const publishDisconnectedResponse = await page.request.post(`${providerApi}/publish`, {
    data: { versionId: disconnectedVersionId },
  });
  expect(publishDisconnectedResponse.ok()).toBe(true);
  const disconnectedNamespace = `${publishSlug}-${disconnectedVersionId}`;
  await publishedBundle.goto(successorUrl);
  await publishedBundle.expectNoNewerVersionNotice();
  expect((await page.request.delete(`${providerApi}/published`, {
    data: { versionId: disconnectedVersionId },
  })).ok()).toBe(true);
  await minioS3.expectEmpty(`${disconnectedNamespace}/`);

  // Return to the app to exercise the Settings → Delete Published flow.
  await wf.navigateToBigBundleShareTab();
  const modal = new PreviewPublishModal(page, expect);
  await modal.selectShareVersion(successorVersionId);
  await publishPage.expectVisible();

  await publishPage.openSettingsDropdown();
  await publishPage.clickDeletePublished();
  await snapshot("S3 delete confirm shown");

  await publishPage.confirmDelete();
  await addKeyFrame(deletion);
  await snapshot("S3 published files deleted");

  await minioS3.expectEmpty(`${successorNamespace}/`);
  await minioS3.expectHasFiles(`${versionNamespace}/`);
  expect(JSON.parse(await minioS3.getObjectContent(successorManifestKey))).toEqual({
    schemaVersion: 1,
    successors: {},
  });

  const alreadyAbsentResponse = await page.request.delete(`${providerApi}/published`, {
    data: { versionId: successorVersionId },
  });
  expect(alreadyAbsentResponse.ok()).toBe(true);
  expect(await alreadyAbsentResponse.json()).toMatchObject({ success: true, alreadyAbsent: true });
  const deleteOriginalResponse = await page.request.delete(`${providerApi}/published`, {
    data: { versionId },
  });
  expect(deleteOriginalResponse.ok()).toBe(true);
  await minioS3.expectEmpty(`${versionNamespace}/`);
  const historyAfterDeletion = await page.request.get(`${providerApi}/publication-state?versionId=${successorVersionId}`);
  const deletedState = await historyAfterDeletion.json() as {
    status: { kind: string };
    events: Array<{ eventType: string }>;
  };
  expect(deletedState.status.kind).toBe("removed");
  expect(deletedState.events.map(event => event.eventType)).toEqual([
    "publication-success",
    "republish-success",
    "publication-success",
    "publication-success",
    "remote-deletion-success",
    "remote-deletion-success",
    "remote-deletion-success",
    "remote-deletion-success",
  ]);

  await expect.poll(() => fs.readFileSync(path.join(testServer.configDir, "logs", "meadow.log"), "utf8"))
    .toMatch(/\[operation ([0-9a-f-]+)] \[s3-publish] Started[\s\S]*\[operation \1] \[s3-publish] Published version/);
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
