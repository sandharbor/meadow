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

// First sanity test for the report viewer's own e2e suite. Proves the
// fixture plumbing works end-to-end: the cached publish-flow artifact
// loads into the report viewer and contains multiple ticks AND multiple
// snapshots. This is intentionally minimal — future tests will exercise
// specific tabs and behaviors.

let fixture: PublishFlowFixture;

test.beforeAll(() => {
  fixture = ensurePublishFlowArtifact();
});

test("cached publish-flow artifact has multiple ticks and multiple snapshots", async ({
  page,
  request,
}) => {
  const { runId, testSlug } = fixture;

  // 1. API-level sanity (fails fast with clear message if the fixture is
  //    malformed or the server can't read it).
  const manifestRes = await request.get(`/api/${runId}/${testSlug}/manifest`);
  expect(manifestRes.ok()).toBe(true);
  const manifest = (await manifestRes.json()) as { ticks?: unknown[] };
  expect(
    Array.isArray(manifest.ticks) ? manifest.ticks.length : 0,
    "manifest should contain multiple ticks"
  ).toBeGreaterThan(1);

  const snapshotsRes = await request.get(
    `/api/${runId}/${testSlug}/snapshots`
  );
  expect(snapshotsRes.ok()).toBe(true);
  const snapshots = (await snapshotsRes.json()) as unknown[];
  expect(
    snapshots.length,
    "scenario should have multiple MeadowHome snapshots"
  ).toBeGreaterThan(1);

  // 2. UI-level sanity: load the scenario page and confirm it renders
  //    the scenario. We assert the breadcrumb shows the test slug (proof
  //    the client-side router mounted ScenarioViewer for this artifact)
  //    and that the tick dropdown button is present (proof ScenarioViewer
  //    detected hasTicks=true from the manifest).
  //
  //    We intentionally do NOT assert on the "Tick X/Y" counter text —
  //    that only renders after a tick is selected (initial state shows
  //    "Tick: --"). Future specs that exercise tick navigation will
  //    assert on the counter directly.
  await page.goto(`/${runId}/${testSlug}`);
  await expect(page.getByText(testSlug)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Tick/ })).toBeVisible();
});
