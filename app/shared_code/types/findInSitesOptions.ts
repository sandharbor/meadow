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

/**
 * Options for the "Find in Sites" feature.
 * This type is used when navigating to the sites list to show which sites track a specific page.
 * Can be provided via CLI arguments or by clicking "Find in Sites" button in the graph view.
 */
export interface FindInSitesOptions {
  vaultPath: string;
  folderPath: string;
  pageName: string;
}

