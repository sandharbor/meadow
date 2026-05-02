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

export const smallSite: SiteDoc = {
  id: "meadow-test-site-small",
  name: "Small Site",
  description:
    "The pre-configured \"small\" fixture site under home_fixture_big_and_small. " +
    "A trimmed slice of the meadow-test-sites-data source graph rooted at a " +
    "deeply-nested page; useful for find-in-sites navigation and multi-site " +
    "scenarios alongside the Big site.",
};
