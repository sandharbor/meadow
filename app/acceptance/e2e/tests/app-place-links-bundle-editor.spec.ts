/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from "../src/run/test-fixtures.js";
import { checkPlaceLinks, placeExamples, placesFor } from "../src/run/placeLinkCheck.js";
import { sourcingReviewRedesign, appPlace, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Every bundle editor surface opens from its link`);

const description = linkedScenarioDescription(conceptText`Open every bundle editor surface declared under contracts/places from its link,
one fresh load each, and require the app to report reaching exactly that
place with no shortfall callout.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '74506a75-c49f-4ba1-aba8-fd3146b023df' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Test start ---
  // Follow each link in turn.
  const places = placesFor(placeExamples({ sourceGraphsDir: testServer.sourceGraphsDir }), key => key.startsWith("bundle:") && key !== "bundle:preview");
  await sourceCommand(() => checkPlaceLinks(page, expect, places));
  await sourceCommand(() => addKeyFrame(appPlace));
  await sourceCommand(() => checkpoint("every bundle editor surface opened from its link"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
