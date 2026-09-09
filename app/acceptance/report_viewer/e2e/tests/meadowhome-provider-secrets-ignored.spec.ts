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

import { test, expect } from "@playwright/test";
import {
  ensurePublishFlowArtifact,
  type PublishFlowFixture,
} from "../fixtures/publish-flow-fixture.js";
import { TickNavComponent } from "../pages/TickNavComponent.js";
import { MeadowHomeFilesComponent } from "../pages/MeadowHomeFilesComponent.js";

// Provider secrets live in the provider configuration directory. Locate the
// captured ignored file and its observed tick rather than assuming an old path.
let fixture: PublishFlowFixture;

test.beforeAll(() => {
  fixture = ensurePublishFlowArtifact();
});

test("captured provider secrets are rendered as gitignored in MeadowHome files", async ({
  page, request,
}) => {
  const { runId, testSlug } = fixture;

  await page.goto(`/${runId}/${testSlug}`);

  const tickNav = new TickNavComponent(page, expect);
  const files = new MeadowHomeFilesComponent(page, expect);

  await files.activate();
  const manifest = await (await request.get(`/api/${runId}/${testSlug}/manifest`)).json() as { ticks: { ignoredFiles?: string[] }[] };
  const secretPath = manifest.ticks.flatMap(tick => tick.ignoredFiles ?? []).find(file => file.endsWith("/pp_secrets.yaml"));
  expect(secretPath, "the publish flow must capture ignored provider secrets").toBeDefined();
  const firstIgnoredTick = manifest.ticks.findIndex(tick => tick.ignoredFiles?.includes(secretPath!));
  expect(firstIgnoredTick, "the publish flow must capture the ignored config file").toBeGreaterThanOrEqual(0);
  await tickNav.goToTick(firstIgnoredTick + 1);

  await files.expectFileIgnored(secretPath!);
});
