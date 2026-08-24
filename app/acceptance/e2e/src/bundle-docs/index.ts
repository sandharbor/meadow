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
export type { BundleDoc } from "./types.js";

export { bigBundle } from "./big-bundle.js";
export { smallBundle } from "./small-bundle.js";
export { hooksBundle } from "./hooks-bundle.js";
export { customBundle } from "./custom-bundle.js";
export { exampleBundle, exampleBundleInitialPageTitle } from "./example-bundle.js";

import { bigBundle } from "./big-bundle.js";
import { smallBundle } from "./small-bundle.js";
import { hooksBundle } from "./hooks-bundle.js";
import { customBundle } from "./custom-bundle.js";
import { exampleBundle } from "./example-bundle.js";

export const allBundleDocs: BundleDoc[] = [
  bigBundle,
  smallBundle,
  hooksBundle,
  customBundle,
  exampleBundle,
];
