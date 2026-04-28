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

export const blacklist: ScenarioDoc = {
  id: "blacklist",
  name: "Blacklist",
  description:
    "Tests covering per-page blacklisting. Blacklisting a single page is a " +
    "simple op that auto-saves immediately, removing the page from the " +
    "generated site preview. Blacklisting is not transitive — pages linked " +
    "from a blacklisted page remain visible as long as they are reachable " +
    "through another tracked path.",
};
