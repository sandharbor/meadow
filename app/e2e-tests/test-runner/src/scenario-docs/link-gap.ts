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

export const linkGap: ScenarioDoc = {
  id: "link-gap",
  name: "Link Gap",
  description:
    "Tests that the in-link gap filter auto-calculates an optimal threshold " +
    "and correctly identifies pages with gaps between source graph and publishing graph inlinks.",
};
