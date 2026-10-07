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
import YAML from "yaml";
import { test, expect } from "../src/run/test-fixtures.js";
import { BundleListPage, PublishToS3Tab } from "../src/run/pages/index.js";
import { Bundle, Workflows } from "../src/run/workflows.js";
import { conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`D04 D05 L02 provider cleanup failure preserves the whole local bundle and retry completes`);

const description = linkedScenarioDescription(conceptText`Publish two revisions, remove S3 credentials, and try deleting the bundle. Failed
cleanup must preserve local files; restoring credentials should make the retry complete.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'd81c197a-003f-471d-a728-1a6a91d1479c' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  minioS3,
  testServer,
  expectLogErrors,
}) => {
  // --- Setup ---
  await sourceCommand(() => testServer.activateS3Provider());
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundleShareTab());
  const publishPage = new PublishToS3Tab(page, expect);
  const publishSlug = `${Bundle.Big}-delete-gate`;
  await sourceCommand(() => publishPage.setPublishSlug(publishSlug));
  await sourceCommand(() => publishPage.clickPublish());
  const firstPublishedUrl = await sourceCommand(() => publishPage.expectPublishSuccess());
  const firstVersionId = firstPublishedUrl.match(/-(v[A-Za-z0-9]{6})\//)?.[1];
  expect(firstVersionId).toBeTruthy();
  const bundleApi = `/api/bundles/${encodeURIComponent(Bundle.Big)}`;
  const createResponse = await sourceCommand(() => page.request.post(`${bundleApi}/generation/versions`, {
    data: { confirmedNoGeneratedChanges: true },
  }));
  expect(createResponse.ok()).toBe(true);
  const secondVersionId = ((await sourceCommand(() => createResponse.json())) as { versionId: string }).versionId;
  expect((await sourceCommand(() => page.request.get(`${bundleApi}/review/save-changes`))).ok()).toBe(true);
  const providerApi = `/api/sharing/publishing-providers/S3PublishingProvider/bundles/${encodeURIComponent(Bundle.Big)}`;
  expect((await sourceCommand(() => page.request.post(`${providerApi}/publish`, { data: { versionId: secondVersionId } }))).ok()).toBe(true);
  await sourceCommand(() => minioS3.expectHasFiles(`${publishSlug}-`));
  await sourceCommand(() => minioS3.expectHasFiles(`${publishSlug}-${firstVersionId}/`));
  await sourceCommand(() => minioS3.expectHasFiles(`${publishSlug}-${secondVersionId}/`));

  await sourceCommand(() => checkpoint("two published revisions have remote files"));

  // --- Test start ---
  // Remove credentials and try deleting the bundle.
  const bundleDirectory = path.join(testServer.configDir, "bundles", Bundle.Big);
  const sentinelConfig = fs.readFileSync(path.join(bundleDirectory, "config", "bundle_config.yaml"));
  const secretsPath = path.join(
    testServer.configDir,
    "app",
    "publishing_providers",
    "S3PublishingProvider",
    "pp_secrets.yaml",
  );
  const originalSecrets = fs.readFileSync(secretsPath);
  const secrets = YAML.parse(originalSecrets.toString("utf8")) as Record<string, unknown>;
  fs.writeFileSync(secretsPath, YAML.stringify({
    ...secrets,
    s3AccessKeyId: "",
    s3SecretAccessKey: "",
  }));

  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickDeleteBundle(Bundle.Big));
  await sourceCommand(() => list.expectPublishedDeleteWarningVisible());
  const stopExpectedErrors = expectLogErrors(/cleanup failed|credentials are required|local bundle was preserved/i);
  await sourceCommand(() => list.confirmDelete());
  await sourceCommand(() => expect(page.getByText(/credentials are required to confirm remote cleanup/i)).toBeVisible({ timeout: 30_000 }));
  stopExpectedErrors();

  expect(fs.existsSync(bundleDirectory)).toBe(true);
  expect(fs.readFileSync(path.join(bundleDirectory, "config", "bundle_config.yaml"))).toEqual(sentinelConfig);
  await sourceCommand(() => minioS3.expectHasFiles(`${publishSlug}-`));
  await sourceCommand(() => checkpoint("provider cleanup failure preserves every local bundle file"));

  // Restore credentials and retry deletion.
  fs.writeFileSync(secretsPath, originalSecrets);
  await sourceCommand(() => list.confirmDelete());
  await sourceCommand(() => list.waitForBundleGone(Bundle.Big));
  expect(fs.existsSync(bundleDirectory)).toBe(false);
  await sourceCommand(() => minioS3.expectEmpty(`${publishSlug}-`));
  await sourceCommand(() => checkpoint("cleanup retry succeeds before local bundle deletion"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
