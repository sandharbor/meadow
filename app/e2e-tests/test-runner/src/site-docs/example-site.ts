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

export const exampleSite: SiteDoc = {
  id: "example-site",
  name: "Example Site",
  description:
    "The bundled example site (Notable Mental Models). Tests that add it from the empty state, " +
    "navigate its graph-pruning features, and preview its content.",
};

/** The title of the initial (landing) page of the example site. */
export const exampleSiteInitialPageTitle = "Notable Mental Models";
