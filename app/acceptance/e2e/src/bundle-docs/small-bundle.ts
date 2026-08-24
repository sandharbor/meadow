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

import { BundleDoc } from "./types.js";

export const smallBundle: BundleDoc = {
  id: "meadow-test-bundle-small",
  name: "Small Bundle",
  description:
    "The pre-configured \"small\" fixture bundle under home_fixture_big_and_small. " +
    "A trimmed slice of the meadow-test-bundles-data source graph rooted at a " +
    "deeply-nested page; useful for find-in-bundles navigation and multi-bundle " +
    "scenarios alongside the Big bundle.",
};
