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

import { cli, publicationRevision, publishing, s3 } from "../../../concepts/index.js";
import { expect, test } from "../src/run/test-fixtures.js";
import { Bundle } from "../src/run/workflows.js";

const PROVIDER_ID = "S3PublishingProvider";

interface Revision {
  publicationRevisionId: string;
  generatedVersionId: string;
  publishSlug: string;
  readerConnectionToPredecessor: string;
  predecessorCleanupPolicy: string;
  remoteState: string;
}

interface PublicationListResult {
  operation: "bundle.publications.list";
  providerId: string;
  state: {
    providerInstanceId: string | null;
    currentRevisionId: string | null;
    pendingRevisionId: string | null;
    revisions: Revision[];
  };
}

test.use({ bundleMode: "single-file" });
test.use({ executionSurface: "cli" });
test.use({ recordVideo: false });

test("CLI manages S3 publication revisions including a same-generation slug change", async ({
  meadowCli,
  minioS3,
  skipMeadowHomeStateCheck,
  testServer,
}) => {
  await testServer.activateS3Provider();
  const providers = await meadowCli.runJson<{
    operation: string;
    providers: Array<{ manifest: { id: string }; isActive: boolean }>;
  }>(["providers", "list"], { artifactName: "publication-providers-list" });
  expect(providers.operation).toBe("providers.list");
  expect(providers.providers).toContainEqual(expect.objectContaining({
    manifest: expect.objectContaining({ id: PROVIDER_ID }),
    isActive: true,
  }));

  const generated = await meadowCli.runJson<{ versionId: string }>([
    "bundle", "generate", Bundle.Big,
  ], { artifactName: "publication-generate-initial" });
  await meadowCli.runJson([
    "bundle", "save-generation", Bundle.Big, "--version", generated.versionId,
  ], { artifactName: "publication-save-initial" });
  const versions = await meadowCli.runJson<{ versions: Array<{ versionId: string }> }>([
    "bundle", "versions", "list", Bundle.Big,
  ], { artifactName: "publication-versions-list" });
  const versionId = versions.versions[0].versionId;
  expect(versionId).toBe(generated.versionId);
  const firstSlug = `${Bundle.Big}-cli-s3`;
  const secondSlug = `${firstSlug}-moved`;

  const configured = await meadowCli.runJson<{ operation: string; publishSlug: string }>([
    "bundle", "publications", "configure", Bundle.Big,
    "--provider", PROVIDER_ID,
    "--slug", firstSlug,
  ], { artifactName: "publication-configure-initial-slug" });
  expect(configured).toMatchObject({
    operation: "bundle.publications.configure",
    publishSlug: firstSlug,
  });
  const firstPublish = await meadowCli.runJson<{ provider: { id: string }; url: string }>([
    "bundle", "publish", Bundle.Big,
    "--version", versionId,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-publish-initial" });
  expect(firstPublish.provider.id).toBe(PROVIDER_ID);
  expect(firstPublish.url).toContain(`${firstSlug}-${versionId}`);

  const initialState = await meadowCli.runJson<PublicationListResult>([
    "bundle", "publications", "list", Bundle.Big,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-list-initial" });
  expect(initialState.state.revisions).toHaveLength(1);
  const initialRevisionId = initialState.state.revisions[0].publicationRevisionId;

  await meadowCli.runJson([
    "bundle", "publications", "configure", Bundle.Big,
    "--provider", PROVIDER_ID,
    "--slug", secondSlug,
    "--version", versionId,
    "--readers", "connected",
    "--predecessor-files", "delete-after-success",
  ], { artifactName: "publication-configure-successor-slug" });
  const planned = await meadowCli.runJson<PublicationListResult>([
    "bundle", "publications", "list", Bundle.Big,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-list-pending" });
  const pendingRevisionId = planned.state.pendingRevisionId!;
  expect(planned.state.revisions).toHaveLength(2);
  expect(planned.state.revisions.find(revision => revision.publicationRevisionId === pendingRevisionId)).toMatchObject({
    generatedVersionId: versionId,
    publishSlug: secondSlug,
    readerConnectionToPredecessor: "connected",
    predecessorCleanupPolicy: "delete-after-success",
    remoteState: "pending",
  });

  const cancelled = await meadowCli.runJson<{ operation: string; publishSlug: string }>([
    "bundle", "publications", "cancel", Bundle.Big, pendingRevisionId,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-cancel-pending" });
  expect(cancelled).toMatchObject({
    operation: "bundle.publications.cancel",
    publishSlug: firstSlug,
  });
  const afterCancellation = await meadowCli.runJson<PublicationListResult>([
    "bundle", "publications", "list", Bundle.Big,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-list-after-cancel" });
  expect(afterCancellation.state.pendingRevisionId).toBeNull();
  expect(afterCancellation.state.revisions).toHaveLength(1);

  await meadowCli.runJson([
    "bundle", "publications", "configure", Bundle.Big,
    "--provider", PROVIDER_ID,
    "--slug", secondSlug,
    "--version", versionId,
    "--readers", "connected",
    "--predecessor-files", "delete-after-success",
  ], { artifactName: "publication-reconfigure-successor-slug" });
  const replanned = await meadowCli.runJson<PublicationListResult>([
    "bundle", "publications", "list", Bundle.Big,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-list-replanned" });
  const replannedRevisionId = replanned.state.pendingRevisionId!;

  const updatedPlan = await meadowCli.runJson<{ pendingRevisionId: string }>([
    "bundle", "publications", "plan", Bundle.Big,
    "--provider", PROVIDER_ID,
    "--version", versionId,
    "--readers", "disconnected",
    "--predecessor-files", "keep",
  ], { artifactName: "publication-update-pending" });
  expect(updatedPlan.pendingRevisionId).toBe(replannedRevisionId);
  const pendingRecord = await meadowCli.runJson<{ revision: Revision }>([
    "bundle", "publications", "get", Bundle.Big, replannedRevisionId,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-get-updated-pending" });
  expect(pendingRecord.revision).toMatchObject({
    readerConnectionToPredecessor: "disconnected",
    predecessorCleanupPolicy: "keep",
  });

  await meadowCli.runJson([
    "bundle", "publications", "plan", Bundle.Big,
    "--provider", PROVIDER_ID,
    "--version", versionId,
    "--readers", "connected",
    "--predecessor-files", "delete-after-success",
  ], { artifactName: "publication-restore-cleanup-plan" });
  await meadowCli.runJson([
    "bundle", "publish", Bundle.Big,
    "--version", versionId,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-publish-successor" });

  const published = await meadowCli.runJson<PublicationListResult>([
    "bundle", "publications", "list", Bundle.Big,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-list-after-successor" });
  expect(published.state.currentRevisionId).toBe(replannedRevisionId);
  expect(published.state.pendingRevisionId).toBeNull();
  expect(published.state.revisions.find(revision => revision.publicationRevisionId === initialRevisionId)?.remoteState).toBe("deleted");
  expect(published.state.revisions.find(revision => revision.publicationRevisionId === replannedRevisionId)?.remoteState).toBe("present");
  await minioS3.expectEmpty(`${firstSlug}-${versionId}/`);
  await minioS3.expectHasHtmlFiles(`${secondSlug}-${versionId}/`);

  const deleted = await meadowCli.runJson<{ operation: string; alreadyAbsent: boolean }>([
    "bundle", "publications", "delete", Bundle.Big, replannedRevisionId,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-delete-current" });
  expect(deleted).toMatchObject({ operation: "bundle.publications.delete", alreadyAbsent: false });
  const retriedDelete = await meadowCli.runJson<{ alreadyAbsent: boolean }>([
    "bundle", "publications", "delete", Bundle.Big, replannedRevisionId,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-delete-current-retry" });
  expect(retriedDelete.alreadyAbsent).toBe(true);
  const deletedRecord = await meadowCli.runJson<{ revision: Revision }>([
    "bundle", "publications", "get", Bundle.Big, replannedRevisionId,
    "--provider", PROVIDER_ID,
  ], { artifactName: "publication-get-deleted" });
  expect(deletedRecord.revision.remoteState).toBe("deleted");
  await minioS3.expectEmpty(`${secondSlug}-${versionId}/`);

  const help = await meadowCli.run(
    ["bundle", "publications", "--help"],
    { artifactName: "publication-help" },
  );
  expect(help).toContain("--readers <connected|disconnected>");
  expect(help).toContain("retains its deleted history record");
  void cli;
  void publicationRevision;
  void publishing;
  void s3;
  await skipMeadowHomeStateCheck();
});
