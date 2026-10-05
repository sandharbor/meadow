/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from "../src/run/test-fixtures.js";
import { checkPlaceLinks, placeExamples, placesFor } from "../src/run/placeLinkCheck.js";
import { appPlace } from "../../../concepts/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Open every Preview and the dialogs inside it surface declared under contracts/places from its link,
 * one fresh load each, and require the app to report reaching exactly that
 * place with no shortfall callout.
 */
test("Preview and the dialogs inside it open from their links", { annotation: { type: 'scenario-id', description: '1baee1d2-da77-4add-8f14-a935966d01aa' } }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Test start ---
  // Follow each link in turn.
  const places = placesFor(placeExamples({ sourceGraphsDir: testServer.sourceGraphsDir }), key => key === "bundle:preview");
  await sourceCommand(() => checkPlaceLinks(page, expect, places));
  await sourceCommand(() => addKeyFrame(appPlace));
  await sourceCommand(() => checkpoint("every Preview and the dialogs inside it surface opened from its link"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
