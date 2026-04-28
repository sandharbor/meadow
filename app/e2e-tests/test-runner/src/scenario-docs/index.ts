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
export type { ScenarioDoc } from "./types.js";

export { publishing } from "./publishing.js";
export { filters } from "./filters.js";
export { frontier } from "./frontier.js";
export { callout } from "./callout.js";
export { htmlGeneration } from "./html-generation.js";
export { hooks } from "./hooks.js";
export { s3 } from "./s3.js";
export { deletion } from "./deletion.js";
export { linkGap } from "./link-gap.js";
export { labels } from "./labels.js";
export { sensitive } from "./sensitive.js";
export { search } from "./search.js";
export { links } from "./links.js";
export { customize } from "./customize.js";
export { changesTab } from "./changes-tab.js";
export { multiSite } from "./multi-site.js";
export { exampleSiteFeature } from "./example-site.js";
export { siteConfig } from "./site-config.js";
export { overrides } from "./overrides.js";
export { initialPage } from "./initial-page.js";
export { images } from "./images.js";
export { markdown } from "./markdown.js";
export { git } from "./git.js";
export { findInSites } from "./find-in-sites.js";
export { archived } from "./archived.js";
export { blacklist } from "./blacklist.js";
export { tracking } from "./tracking.js";
export { migration } from "./migration.js";

import { publishing } from "./publishing.js";
import { filters } from "./filters.js";
import { frontier } from "./frontier.js";
import { callout } from "./callout.js";
import { htmlGeneration } from "./html-generation.js";
import { hooks } from "./hooks.js";
import { s3 } from "./s3.js";
import { deletion } from "./deletion.js";
import { linkGap } from "./link-gap.js";
import { labels } from "./labels.js";
import { sensitive } from "./sensitive.js";
import { search } from "./search.js";
import { links } from "./links.js";
import { customize } from "./customize.js";
import { changesTab } from "./changes-tab.js";
import { multiSite } from "./multi-site.js";
import { exampleSiteFeature } from "./example-site.js";
import { siteConfig } from "./site-config.js";
import { overrides } from "./overrides.js";
import { initialPage } from "./initial-page.js";
import { images } from "./images.js";
import { markdown } from "./markdown.js";
import { git } from "./git.js";
import { findInSites } from "./find-in-sites.js";
import { archived } from "./archived.js";
import { blacklist } from "./blacklist.js";
import { tracking } from "./tracking.js";
import { migration } from "./migration.js";

export const allDocs: ScenarioDoc[] = [publishing, filters, frontier, callout, htmlGeneration, hooks, s3, deletion, linkGap, labels, sensitive, search, links, customize, changesTab, multiSite, exampleSiteFeature, siteConfig, overrides, initialPage, images, markdown, git, findInSites, archived, blacklist, tracking, migration];
