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

export const migration: ScenarioDoc = {
  id: "migration",
  name: "Migration",
  description:
    "Tests that boot the app against a pre-migration MeadowHome snapshot and " +
    "verify the startup migration runner recognises the pending migration, " +
    "runs it cleanly, records it in migrations.yaml, and leaves the site in a " +
    "usable state — real-world coverage that the on-disk rewrites don't just " +
    "succeed on fresh data but on snapshots captured from earlier app versions.",
};
