/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from "../src/run/test-fixtures.js";
import { AppPlace, BundleEditorPage } from "../src/run/pages/index.js";
import { appPlace, callout, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`A link the app cannot follow all the way opens as deep as it can and says where it stopped`);

const description = linkedScenarioDescription(conceptText`Follow a link that asks for more than the bundle can show: a custom filter
that does not exist and a selected page that is gone. The app opens as deep
as it can, selects the page that still exists, and a callout says exactly
where it stopped. The Runtime receives the same report a CLI caller reads.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '2771ea2c-ce5c-44d6-81dd-eabb2aa8f97a' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Test start ---
  // Follow the link into the big bundle.
  const places = new AppPlace(page, expect);
  const requested = "/bundle/meadow-test-bundle-big?surface=custom-filter&filter=missing-filter&select=id:ef63f962db68,key:%2Fno+such+page.md";
  await sourceCommand(() => places.open(requested));
  await sourceCommand(() => new BundleEditorPage(page, expect).waitForLoad("meadow-test-bundle-big"));
  await sourceCommand(() => places.expectArrivalCallout(
    "Opened meadow-test-bundle-big › 1 selected, but 1 of 2 selected pages no longer exists; "
    + "Custom filter couldn't open: there is no custom filter missing-filter.×",
  ));
  await sourceCommand(() => places.expectCurrent("/bundle/meadow-test-bundle-big?select=id:ef63f962db68"));
  await sourceCommand(() => addKeyFrame(callout, appPlace));
  await sourceCommand(() => checkpoint("the app reached the bundle and the page that still exists"));

  // Check the report the sender reads back.
  const { baseUrl, capability } = testServer.getBackendConnectionForRendererTest();
  const response = await sourceCommand(() => page.request.get(`${baseUrl}/places/arrivals`, { headers: { "x-meadow-capability": capability } }));
  const { arrivals } = await sourceCommand(() => response.json()) as { arrivals: { requested: string; reached: string; notice?: string }[] };
  expect(arrivals.at(-1)).toMatchObject({
    requested,
    reached: "/bundle/meadow-test-bundle-big?select=id:ef63f962db68",
    notice: expect.stringContaining("there is no custom filter missing-filter"),
  });
  await sourceCommand(() => places.dismissArrivalCallout());
  await sourceCommand(() => checkpoint("the arrival report matches what the app reached"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
