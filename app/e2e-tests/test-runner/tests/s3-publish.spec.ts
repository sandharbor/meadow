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

import { test, expect } from "../src/run/test-fixtures.js";
import { PublishToS3Tab, PublishedBundlePage } from "../src/run/pages/index.js";
import { Workflows, Bundle } from "../src/run/workflows.js";
import { publishing, s3, deletion } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("S3 provider publishes and deletes a bundle via MinIO", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
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

  const publishSlug = `${Bundle.Big}-s3`;
  await publishPage.setPublishSlug(publishSlug);
  await snapshot("S3 publish slug saved");

  await minioS3.expectEmpty(`${publishSlug}/`);

  await publishPage.clickPublish();
  const publishedUrl = await publishPage.expectPublishSuccess();
  await publishPage.expectNoError();
  await addKeyFrame(publishing);
  await addKeyFrame(s3);
  await snapshot("S3 publish succeeded");

  expect(publishedUrl.startsWith("http://localhost")).toBe(true);
  expect(publishedUrl.includes(`/${publishSlug}/`)).toBe(true);

  await minioS3.expectHasFiles(`${publishSlug}/`);
  await minioS3.expectHasHtmlFiles(`${publishSlug}/`);

  const publishedBundle = new PublishedBundlePage(page, expect);
  await publishedBundle.goto(publishedUrl);
  await publishedBundle.expectMainHeadingVisible();
  await snapshot("browsed S3-published bundle");

  // Return to the app to exercise the Settings → Delete Published flow.
  await wf.navigateToBigBundleShareTab();
  await publishPage.expectVisible();

  await publishPage.openSettingsDropdown();
  await publishPage.clickDeletePublished();
  await snapshot("S3 delete confirm shown");

  await publishPage.confirmDelete();
  await addKeyFrame(deletion);
  await snapshot("S3 published files deleted");

  await minioS3.expectEmpty(`${publishSlug}/`);
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
