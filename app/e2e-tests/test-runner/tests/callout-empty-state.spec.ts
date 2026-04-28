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
import { SiteListPage } from "../src/run/pages/index.js";
import { callout } from "../src/scenario-docs/index.js";

test.use({ fixtureHome: "none" });

test("Callout turn your notes into sites shown on empty state", async ({ page, snapshot, addKeyFrame }) => {
  const siteList = new SiteListPage(page, expect);
  await siteList.goto();
  await snapshot("empty site list loaded");

  await siteList.expectCalloutVisible("Turn your notes into sites");
  await addKeyFrame(callout);
  await snapshot("turn your notes into sites callout visible");
});
