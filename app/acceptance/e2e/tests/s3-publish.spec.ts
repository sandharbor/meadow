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
import { publishing, s3, deletion, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`R02 R04 R05 R06 R07 R08 P02 P06 D02 L01 S3 version publication and reader awareness lifecycle`);

const description = linkedScenarioDescription(conceptText`Publish successive generated versions to S3 with different reader connections and
cleanup choices. Check version links, remote files, publication history, and deletion
behavior.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'f133eb45-0c07-4621-bf2a-b753ee1038b7' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  artifactDir,
  minioS3,
  testServer,
}) => {
  // --- Setup ---
  // Swap the active provider to S3PublishingProvider before the frontend
  // fetches /api/sharing/publishing-providers.
  await sourceCommand(() => testServer.activateS3Provider());

  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundleShareTab());

  const publishPage = new PublishToS3Tab(page, expect);
  await sourceCommand(() => publishPage.expectVisible());

  await sourceCommand(() => expect(page.getByTestId('s3-config-summary')).toContainText('credentials saved'));
  await sourceCommand(() => page.getByTestId('s3-config-toggle').click());
  await sourceCommand(() => expect(page.getByTestId('s3-access-key-id')).toHaveValue('••••••••'));
  await sourceCommand(() => expect(page.getByTestId('s3-secret-access-key')).toHaveValue('••••••••••••••••'));
  await sourceCommand(() => expect(page.getByText(/saved values cannot be shown/i)).toBeVisible());
  expect(await sourceCommand(() => page.content())).not.toContain(E2E_S3_ACCESS_KEY_ID);
  expect(await sourceCommand(() => page.content())).not.toContain(E2E_S3_SECRET_ACCESS_KEY);
  await sourceCommand(() => checkpoint('saved S3 credentials represented only by presence'));

  // --- Test start ---
  // Choose a publication slug.
  await sourceCommand(() => page.getByTestId('s3-secret-access-key').scrollIntoViewIfNeeded());
  await sourceCommand(() => addKeyFrame(s3));
  await sourceCommand(() => page.getByTestId('s3-config-toggle').click());

  const publishSlug = `${Bundle.Big}-s3`;
  await sourceCommand(() => publishPage.setPublishSlug(publishSlug));
  await sourceCommand(() => checkpoint("S3 publish slug saved"));

  // Publish to S3.
  await sourceCommand(() => minioS3.expectEmpty(`${publishSlug}-`));

  await sourceCommand(() => publishPage.clickPublish());
  const publishedUrl = await sourceCommand(() => publishPage.expectPublishSuccess());
  await sourceCommand(() => publishPage.expectNoError());
  await sourceCommand(() => addKeyFrame(publishing));
  await sourceCommand(() => addKeyFrame(s3));
  await sourceCommand(() => checkpoint("S3 publish succeeded"));

  // Inspect and browse the publication.
  expect(publishedUrl.startsWith("http://localhost")).toBe(true);
  const versionMatch = publishedUrl.match(new RegExp(`/${publishSlug}-(v[A-Za-z0-9]{6})/`));
  expect(versionMatch).not.toBeNull();
  const versionId = versionMatch![1];
  const versionNamespace = `${publishSlug}-${versionId}`;

  await sourceCommand(() => minioS3.expectHasFiles(`${versionNamespace}/`));
  await sourceCommand(() => minioS3.expectHasHtmlFiles(`${versionNamespace}/`));
  const successorManifestKey = `${publishSlug}-versions.json`;
  expect(await sourceCommand(() => minioS3.listKeys(successorManifestKey))).toEqual([successorManifestKey]);
  expect(JSON.parse(await sourceCommand(() => minioS3.getObjectContent(successorManifestKey)))).toEqual({
    schemaVersion: 1,
    successors: {},
  });

  // The same saved generation at the same address remains one revision.
  await sourceCommand(() => publishPage.expectPublishButtonLabel("Republish"));
  await sourceCommand(() => publishPage.clickPublish());
  expect(await sourceCommand(() => publishPage.expectPublishSuccess())).toBe(publishedUrl);
  const providerApi = `/api/sharing/publishing-providers/S3PublishingProvider/bundles/${encodeURIComponent(Bundle.Big)}`;
  const publicationStateResponse = await sourceCommand(() => page.request.get(`${providerApi}/publication-state?versionId=${versionId}`));
  expect(publicationStateResponse.ok()).toBe(true);
  const publicationState = await sourceCommand(() => publicationStateResponse.json()) as {
    status: { kind: string };
    revisions: Array<{ generatedVersionId: string; publishSlug: string; remoteState: string }>;
  };
  expect(publicationState.status.kind).toBe("published-current");
  expect(publicationState.revisions).toEqual([
    expect.objectContaining({ generatedVersionId: versionId, publishSlug, remoteState: "present" }),
  ]);

  const changedPublishSlug = `${publishSlug}-changed`;
  const changedDestinationResponse = await sourceCommand(() => page.request.put(`${providerApi}/provider-config`, {
    data: {
      publishSlug: changedPublishSlug,
      readerConnectionToPredecessor: "connected",
      predecessorCleanupPolicy: "keep",
    },
  }));
  expect(changedDestinationResponse.ok()).toBe(true);
  const plannedSlugState = await sourceCommand(async () => (await page.request.get(`${providerApi}/publication-state?versionId=${versionId}`)).json()) as {
    pendingRevisionId: string;
    revisions: Array<{ publicationRevisionId: string; generatedVersionId: string; publishSlug: string; remoteState: string }>;
  };
  expect(plannedSlugState.revisions.find(revision => revision.publicationRevisionId === plannedSlugState.pendingRevisionId))
    .toMatchObject({ generatedVersionId: versionId, publishSlug: changedPublishSlug, remoteState: "pending" });
  expect((await sourceCommand(() => page.request.put(`${providerApi}/provider-config`, {
    data: {
      publishSlug,
      readerConnectionToPredecessor: "connected",
      predecessorCleanupPolicy: "keep",
    },
  }))).ok()).toBe(true);

  // Keep the Meadow page open while checking the published site. Navigating
  // the only app page away correctly closes its browser-session heartbeat,
  // which would make the later authenticated API setup depend on close-grace
  // timing rather than the publication behavior under test.
  const readerPage = await sourceCommand(() => page.context().newPage());
  const publishedBundle = new PublishedBundlePage(readerPage, expect);
  await sourceCommand(() => publishedBundle.goto(publishedUrl));
  await sourceCommand(() => publishedBundle.expectMainHeadingVisible());
  await sourceCommand(() => publishedBundle.expectNoNewerVersionNotice());
  await sourceCommand(() => checkpoint("browsed S3-published bundle"));

  // Publish a connected successor.
  const createSuccessorResponse = await sourceCommand(() => page.request.post(
    `/api/bundles/${encodeURIComponent(Bundle.Big)}/generation/versions`,
    { data: { notes: "Connected reader successor", confirmedNoGeneratedChanges: true } },
  ));
  expect(createSuccessorResponse.ok()).toBe(true);
  const successorVersionId = (await sourceCommand(() => createSuccessorResponse.json()) as { versionId: string }).versionId;
  const saveSuccessorResponse = await sourceCommand(() => page.request.get(`/api/bundles/${encodeURIComponent(Bundle.Big)}/review/save-changes`));
  expect(saveSuccessorResponse.ok()).toBe(true);
  const publishSuccessorResponse = await sourceCommand(() => page.request.post(`${providerApi}/publish`, {
    data: { versionId: successorVersionId },
  }));
  expect(publishSuccessorResponse.ok()).toBe(true);
  const successorUrl = (await sourceCommand(() => publishSuccessorResponse.json()) as { publishedUrl: string }).publishedUrl;
  const successorNamespace = `${publishSlug}-${successorVersionId}`;
  await sourceCommand(() => minioS3.expectHasHtmlFiles(`${successorNamespace}/`));
  const successorManifest = JSON.parse(await sourceCommand(() => minioS3.getObjectContent(successorManifestKey))) as {
    successors: Record<string, { versionId: string; versionRoot: string; entryPath: string }>;
  };
  expect(successorManifest.successors[versionId]).toMatchObject({
    versionId: successorVersionId,
    versionRoot: successorNamespace,
  });

  await sourceCommand(() => publishedBundle.goto(publishedUrl));
  await sourceCommand(() => publishedBundle.expectNewerPageLink(successorUrl));
  await sourceCommand(() => checkpoint("older page links to its connected successor"));

  // Check the successor route mapping.
  // Remove the stable identity from the successor route index: the old page
  // must offer only the successor entry page, never a nonexistent equivalent.
  const successorRouteKey = (await sourceCommand(() => minioS3.listKeys(`${successorNamespace}/_mw_assets/versioning/routes.`)))[0];
  expect(successorRouteKey).toBeTruthy();
  const routeIndex = JSON.parse(await sourceCommand(() => minioS3.getObjectContent(successorRouteKey))) as {
    schemaVersion: 1;
    entryPath: string;
    routesByBundleNodeId: Record<string, string>;
    generatedPagePaths: string[];
  };
  const stableEntry = Object.entries(routeIndex.routesByBundleNodeId)
    .find(([, generatedPath]) => generatedPath === routeIndex.entryPath);
  expect(stableEntry).toBeTruthy();
  const movedPath = "moved-reader-entry.html";
  await sourceCommand(async () => minioS3.putObjectContent(
    `${successorNamespace}/${movedPath}`,
    await minioS3.getObjectContent(`${successorNamespace}/${routeIndex.entryPath}`),
    "text/html",
  ));
  await sourceCommand(() => minioS3.putObjectContent(successorRouteKey, JSON.stringify({
    ...routeIndex,
    routesByBundleNodeId: {
      ...routeIndex.routesByBundleNodeId,
      [stableEntry![0]]: movedPath,
    },
    generatedPagePaths: [...routeIndex.generatedPagePaths, movedPath],
  })));
  const movedUrl = new URL(movedPath, successorUrl).toString();
  await sourceCommand(() => publishedBundle.goto(publishedUrl));
  await sourceCommand(() => publishedBundle.expectNewerPageLink(movedUrl));
  await sourceCommand(() => checkpoint("stable page identity follows a moved successor route"));

  // Remove the matching successor page.
  await sourceCommand(() => minioS3.putObjectContent(successorRouteKey, JSON.stringify({
    ...routeIndex,
    routesByBundleNodeId: {},
  })));
  await sourceCommand(() => publishedBundle.goto(publishedUrl));
  await sourceCommand(() => publishedBundle.expectMissingPageNotice(successorUrl));
  await sourceCommand(() => checkpoint("missing-page reader callout links only to successor entry"));

  // Delete the successor publication.
  await sourceCommand(() => readerPage.screenshot({
    path: path.join(artifactDir, "missing-page-reader-callout.png"),
    fullPage: true,
  }));

  // Lookup failures are deliberately silent and recover when the destination
  // manifest becomes readable again.
  await sourceCommand(() => minioS3.putObjectContent(successorManifestKey, "{invalid-json"));
  await sourceCommand(() => publishedBundle.goto(publishedUrl));
  await sourceCommand(() => publishedBundle.expectNoNewerVersionNotice());
  await sourceCommand(() => minioS3.putObjectContent(successorManifestKey, JSON.stringify(successorManifest)));

  // A published but disconnected third version must not notify the second
  // lineage even though it is later in manifest order.
  const createDisconnectedResponse = await sourceCommand(() => page.request.post(
    `/api/bundles/${encodeURIComponent(Bundle.Big)}/generation/versions`,
    {
      data: { notes: "Disconnected reader release", confirmedNoGeneratedChanges: true },
    },
  ));
  expect(createDisconnectedResponse.ok()).toBe(true);
  const disconnectedVersionId = (await sourceCommand(() => createDisconnectedResponse.json()) as { versionId: string }).versionId;
  expect((await sourceCommand(() => page.request.get(`/api/bundles/${encodeURIComponent(Bundle.Big)}/review/save-changes`))).ok()).toBe(true);
  expect((await sourceCommand(() => page.request.post(`${providerApi}/publication-revisions/plan`, {
    data: {
      versionId: disconnectedVersionId,
      readerConnectionToPredecessor: "disconnected",
      predecessorCleanupPolicy: "keep",
    },
  }))).ok()).toBe(true);
  const publishDisconnectedResponse = await sourceCommand(() => page.request.post(`${providerApi}/publish`, {
    data: { versionId: disconnectedVersionId },
  }));
  expect(publishDisconnectedResponse.ok()).toBe(true);
  const disconnectedNamespace = `${publishSlug}-${disconnectedVersionId}`;
  await sourceCommand(() => publishedBundle.goto(successorUrl));
  await sourceCommand(() => publishedBundle.expectNoNewerVersionNotice());
  expect((await sourceCommand(() => page.request.delete(`${providerApi}/published`, {
    data: { versionId: disconnectedVersionId },
  }))).ok()).toBe(true);
  await sourceCommand(() => minioS3.expectEmpty(`${disconnectedNamespace}/`));

  // Return to the app to exercise the Settings → Delete Published flow.
  await sourceCommand(() => wf.navigateToBigBundleShareTab());
  const modal = new PreviewPublishModal(page, expect);
  await sourceCommand(() => modal.selectShareVersion(successorVersionId));
  await sourceCommand(() => publishPage.expectVisible());

  await sourceCommand(() => publishPage.openSettingsDropdown());
  await sourceCommand(() => publishPage.clickDeletePublished());
  await sourceCommand(() => checkpoint("S3 delete confirm shown"));

  // Confirm remote deletion.
  await sourceCommand(() => publishPage.confirmDelete());
  await sourceCommand(() => addKeyFrame(deletion));
  await sourceCommand(() => checkpoint("S3 published files deleted"));

  // Check the retained history.
  await sourceCommand(() => minioS3.expectEmpty(`${successorNamespace}/`));
  await sourceCommand(() => minioS3.expectHasFiles(`${versionNamespace}/`));
  expect(JSON.parse(await sourceCommand(() => minioS3.getObjectContent(successorManifestKey)))).toEqual({
    schemaVersion: 1,
    successors: {},
  });

  const alreadyAbsentResponse = await sourceCommand(() => page.request.delete(`${providerApi}/published`, {
    data: { versionId: successorVersionId },
  }));
  expect(alreadyAbsentResponse.ok()).toBe(true);
  expect(await sourceCommand(() => alreadyAbsentResponse.json())).toMatchObject({ success: true, alreadyAbsent: true });
  const deleteOriginalResponse = await sourceCommand(() => page.request.delete(`${providerApi}/published`, {
    data: { versionId },
  }));
  expect(deleteOriginalResponse.ok()).toBe(true);
  await sourceCommand(() => minioS3.expectEmpty(`${versionNamespace}/`));
  const historyAfterDeletion = await sourceCommand(() => page.request.get(`${providerApi}/publication-state?versionId=${successorVersionId}`));
  const deletedState = await sourceCommand(() => historyAfterDeletion.json()) as {
    status: { kind: string };
    revisions: Array<{ remoteState: string }>;
  };
  expect(deletedState.status.kind).toBe("removed");
  expect(deletedState.revisions.map(revision => revision.remoteState)).toEqual(["deleted", "deleted", "deleted"]);

  await sourceCommand(() => expect.poll(() => fs.readFileSync(path.join(testServer.configDir, "logs", "meadow.log"), "utf8"))
    .toMatch(/\[operation ([0-9a-f-]+)] \[s3-publish] Started[\s\S]*\[operation \1] \[s3-publish] Published version/));
  void bigBundle;

  await sourceCommand(() => checkpoint("the deleted successor retains its history and the older publication survives"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
