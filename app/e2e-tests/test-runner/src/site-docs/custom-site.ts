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

import { SiteDoc } from "./types.js";

export const customSite: SiteDoc = {
  id: "custom-site",
  name: "Custom",
  description:
    "A site built ad-hoc inside the test by walking the \"Create New Site\" " +
    "modal and pointing it at the shared meadow-test-sites-data source graph " +
    "with whatever initial page the scenario needs. Used for tests that " +
    "exercise the new-site flow itself rather than a pre-configured fixture.",
};
