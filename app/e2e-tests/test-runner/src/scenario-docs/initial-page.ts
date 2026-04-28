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

import { ScenarioDoc } from "./types.js";

export const initialPage: ScenarioDoc = {
  id: "initial-page",
  name: "Initial Page",
  description:
    "Tests verifying that the initial page (depth 0) is protected from " +
    "actions that would break the site graph, such as blacklisting, " +
    "untracking, or removing depth constraints.",
};
