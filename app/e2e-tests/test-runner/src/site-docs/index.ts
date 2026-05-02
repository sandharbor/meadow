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
export type { SiteDoc } from "./types.js";

export { bigSite } from "./big-site.js";
export { smallSite } from "./small-site.js";
export { hooksSite } from "./hooks-site.js";
export { customSite } from "./custom-site.js";
export { exampleSite, exampleSiteInitialPageTitle } from "./example-site.js";

import { bigSite } from "./big-site.js";
import { smallSite } from "./small-site.js";
import { hooksSite } from "./hooks-site.js";
import { customSite } from "./custom-site.js";
import { exampleSite } from "./example-site.js";

export const allSiteDocs: SiteDoc[] = [
  bigSite,
  smallSite,
  hooksSite,
  customSite,
  exampleSite,
];
