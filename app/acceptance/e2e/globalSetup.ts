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

import { acquireLocalServices } from "../../tooling/local_services/src/index.js";
import { e2eLocalServicesHolder } from "./src/run/localServicePartitions.js";

// The run holds Local Services for its whole duration. Workers lease their
// own partitions; containers keep running for any open Dev Tools fork.
export default async function globalSetup(): Promise<void> {
  await acquireLocalServices(e2eLocalServicesHolder());
}
